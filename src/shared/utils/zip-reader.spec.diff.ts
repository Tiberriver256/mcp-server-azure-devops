import { execFileSync } from 'child_process';
import fc from 'fast-check';
import { readZipArchive } from './zip-reader';
import { buildTestZip } from '../test/zip-builder';

function hasPython3(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface ZipSpecEntry {
  name: string;
  contentBase64: string;
  compress: boolean;
  isDir?: boolean;
}

interface PythonBatchOutput {
  builtZipsBase64: string[];
  parsedZips: Array<Record<string, { isDir: boolean; contentBase64: string }>>;
}

/**
 * Independent reference oracle using Python's stdlib `zipfile` module.
 * Runs a single python3 process for a whole batch of archives so the
 * differential suite stays sub-second while validating dozens of archives
 * bidirectionally.
 */
function runPythonZipOracleBatch(input: {
  specsToBuild: ZipSpecEntry[][];
  zipsToReadBase64: string[];
}): PythonBatchOutput {
  const script = `
import base64, io, json, sys, zipfile
payload = json.loads(sys.stdin.read())
built = []
for entries in payload["specsToBuild"]:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for e in entries:
            comp = zipfile.ZIP_DEFLATED if e.get("compress") else zipfile.ZIP_STORED
            if e.get("isDir"):
                zf.writestr(zipfile.ZipInfo(e["name"]), b"", compress_type=zipfile.ZIP_STORED)
            else:
                zf.writestr(e["name"], base64.b64decode(e["contentBase64"]), compress_type=comp)
    built.append(base64.b64encode(buf.getvalue()).decode("ascii"))

parsed = []
for z_b64 in payload["zipsToReadBase64"]:
    data = base64.b64decode(z_b64)
    out = {}
    with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
        for info in zf.infolist():
            out[info.filename] = {
                "isDir": info.is_dir(),
                "contentBase64": "" if info.is_dir() else base64.b64encode(zf.read(info.filename)).decode("ascii"),
            }
    parsed.append(out)

sys.stdout.write(json.dumps({"builtZipsBase64": built, "parsedZips": parsed}))
`;
  const stdout = execFileSync('python3', ['-c', script], {
    input: JSON.stringify(input),
    maxBuffer: 25 * 1024 * 1024,
  });
  return JSON.parse(stdout.toString('utf8')) as PythonBatchOutput;
}

const describeIfPython = hasPython3() ? describe : describe.skip;

describeIfPython(
  'zip-reader differential tests vs Python stdlib zipfile oracle',
  () => {
    it('matches Python zipfile byte-for-byte across Stored, Deflate, UTF-8 names, nested folders, and empty files', () => {
      const entries: ZipSpecEntry[] = [
        { name: 'drop/', contentBase64: '', compress: false, isDir: true },
        {
          name: 'drop/empty.txt',
          contentBase64: Buffer.from('').toString('base64'),
          compress: false,
        },
        {
          name: 'drop/metrics.json',
          contentBase64: Buffer.from('{"latencyMs":12.5,"ok":true}\n').toString(
            'base64',
          ),
          compress: true,
        },
        {
          name: 'drop/über/café-日本語.txt',
          contentBase64: Buffer.from('héllo 世界 🚀', 'utf8').toString(
            'base64',
          ),
          compress: true,
        },
        {
          name: 'drop/raw.bin',
          contentBase64: Buffer.from([
            0x00, 0xff, 0x7f, 0x80, 0x50, 0x4b, 0x03, 0x04,
          ]).toString('base64'),
          compress: false,
        },
      ];

      const { builtZipsBase64 } = runPythonZipOracleBatch({
        specsToBuild: [entries],
        zipsToReadBase64: [],
      });
      const parsed = readZipArchive(Buffer.from(builtZipsBase64[0], 'base64'));

      expect(parsed.entries.map((e) => e.name)).toEqual(
        entries.map((e) => e.name),
      );
      for (const expected of entries) {
        const meta = parsed.findEntry(expected.name);
        expect(meta).toBeDefined();
        expect(meta?.isDirectory).toBe(Boolean(expected.isDir));
        if (!expected.isDir) {
          expect(parsed.readEntryBuffer(meta!).toString('base64')).toBe(
            expected.contentBase64,
          );
        }
      }
    });

    it('agrees bidirectionally with Python zipfile across 30 fast-check generated multi-file archives', () => {
      const segArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,10}$/);
      const archiveArb = fc.uniqueArray(
        fc.record({
          name: fc
            .array(segArb, { minLength: 1, maxLength: 3 })
            .map((p) => p.join('/')),
          bytes: fc.uint8Array({ minLength: 0, maxLength: 300 }),
          compress: fc.boolean(),
        }),
        { selector: (e) => e.name, minLength: 1, maxLength: 6 },
      );

      const sampledArchives = fc.sample(archiveArb, {
        numRuns: 30,
        seed: 20261124,
      });

      const specsToBuild: ZipSpecEntry[][] = sampledArchives.map((files) =>
        files.map((f) => ({
          name: f.name,
          contentBase64: Buffer.from(f.bytes).toString('base64'),
          compress: f.compress,
        })),
      );

      const nodeZips = sampledArchives.map((files) =>
        buildTestZip(
          files.map((f) => ({
            name: f.name,
            content: Buffer.from(f.bytes),
            method: f.compress ? 8 : 0,
          })),
        ),
      );

      const { builtZipsBase64, parsedZips } = runPythonZipOracleBatch({
        specsToBuild,
        zipsToReadBase64: nodeZips.map((z) => z.toString('base64')),
      });

      sampledArchives.forEach((files, idx) => {
        // Direction A: Python generates ZIP -> our readZipArchive parses it
        const tsParsed = readZipArchive(
          Buffer.from(builtZipsBase64[idx], 'base64'),
        );
        expect(tsParsed.entries).toHaveLength(files.length);
        for (const file of files) {
          const entry = tsParsed.findEntry(file.name);
          expect(entry).toBeDefined();
          expect(tsParsed.readEntryBuffer(entry!)).toEqual(
            Buffer.from(file.bytes),
          );
        }

        // Direction B: our buildTestZip generates ZIP -> Python zipfile & our reader agree
        const pyRead = parsedZips[idx];
        const tsRead = readZipArchive(nodeZips[idx]);
        for (const file of files) {
          const entry = tsRead.findEntry(file.name)!;
          expect(tsRead.readEntryBuffer(entry).toString('base64')).toBe(
            pyRead[file.name].contentBase64,
          );
        }
      });
    });
  },
);
