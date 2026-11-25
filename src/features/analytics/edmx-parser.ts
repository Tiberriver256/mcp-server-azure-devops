import { AzureDevOpsError } from '../../shared/errors/index.ts';
import type {
  EdmxEntitySet,
  EdmxEntityType,
  EdmxNavigationProperty,
  EdmxProperty,
  ParsedEdmxMetadata,
} from './types.ts';

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse XML element attributes from an opening/self-closing tag's attribute string.
 * Supports double-quoted and single-quoted values and decodes standard XML entities.
 */
function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrText)) !== null) {
    const rawValue = match[2] ?? match[3] ?? '';
    attrs[match[1]] = decodeXmlEntities(rawValue);
  }
  return attrs;
}

function stripNamespacePrefix(qualifiedName: string): string {
  const idx = qualifiedName.lastIndexOf('.');
  return idx === -1 ? qualifiedName : qualifiedName.slice(idx + 1);
}

function stripXmlComments(xml: string): string {
  let result = xml;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  } while (result !== previous);
  return result;
}

/**
 * Extract all elements matching a local XML tag name (with optional namespace prefix),
 * supporting both self-closing `<Tag ... />` and paired `<Tag ...>...</Tag>` forms.
 */
function extractElements(
  xml: string,
  localTagName: string,
): Array<{ attrs: Record<string, string>; body: string }> {
  const results: Array<{ attrs: Record<string, string>; body: string }> = [];
  const openTagRe = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localTagName}\\b([^>]*?)(\\/?)>`,
    'g',
  );
  const closeTagRe = new RegExp(
    `<\\/(?:[A-Za-z_][\\w.-]*:)?${localTagName}\\s*>`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = openTagRe.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const isSelfClosing = match[2] === '/';
    if (isSelfClosing) {
      results.push({ attrs, body: '' });
      continue;
    }

    const bodyStart = openTagRe.lastIndex;
    closeTagRe.lastIndex = bodyStart;
    const closeMatch = closeTagRe.exec(xml);
    if (!closeMatch) {
      results.push({ attrs, body: xml.slice(bodyStart) });
      break;
    }

    const body = xml.slice(bodyStart, closeMatch.index);
    results.push({ attrs, body });
    openTagRe.lastIndex = closeTagRe.lastIndex;
  }

  return results;
}

function parseEntityType(
  attrs: Record<string, string>,
  body: string,
): EdmxEntityType | null {
  const name = attrs.Name?.trim();
  if (!name) {
    return null;
  }

  const keys: string[] = [];
  for (const keyBlock of extractElements(body, 'Key')) {
    for (const propRef of extractElements(keyBlock.body, 'PropertyRef')) {
      const refName = propRef.attrs.Name?.trim();
      if (refName && !keys.includes(refName)) {
        keys.push(refName);
      }
    }
  }

  const properties: EdmxProperty[] = [];
  for (const prop of extractElements(body, 'Property')) {
    const propName = prop.attrs.Name?.trim();
    const propType = prop.attrs.Type?.trim();
    if (!propName || !propType) {
      continue;
    }
    const nullableRaw = prop.attrs.Nullable?.trim().toLowerCase();
    const nullable = nullableRaw !== 'false';
    properties.push({
      name: propName,
      type: propType,
      nullable,
    });
  }

  const navigationProperties: EdmxNavigationProperty[] = [];
  for (const nav of extractElements(body, 'NavigationProperty')) {
    const navName = nav.attrs.Name?.trim();
    const navType = nav.attrs.Type?.trim();
    if (!navName || !navType) {
      continue;
    }
    navigationProperties.push({
      name: navName,
      type: navType,
      isCollection: /^Collection\(.+\)$/i.test(navType),
    });
  }

  return {
    name,
    baseType: attrs.BaseType?.trim() || undefined,
    keys,
    properties,
    navigationProperties,
  };
}

/**
 * Resolve inherited keys, properties, and navigation properties along `BaseType`
 * chains (with cycle protection) so callers inspecting derived EntityTypes see
 * the complete effective schema.
 */
function resolveEntityTypeInheritance(
  rawTypes: Map<string, EdmxEntityType>,
): Map<string, EdmxEntityType> {
  const resolved = new Map<string, EdmxEntityType>();

  const resolveOne = (
    name: string,
    visiting: Set<string>,
  ): EdmxEntityType | undefined => {
    const cached = resolved.get(name);
    if (cached) {
      return cached;
    }
    const raw = rawTypes.get(name);
    if (!raw) {
      return undefined;
    }
    if (!raw.baseType || visiting.has(name)) {
      resolved.set(name, raw);
      return raw;
    }

    visiting.add(name);
    const parentShortName = stripNamespacePrefix(raw.baseType);
    const parent = resolveOne(parentShortName, visiting);
    visiting.delete(name);

    if (!parent) {
      resolved.set(name, raw);
      return raw;
    }

    const keys = Array.from(new Set([...parent.keys, ...raw.keys]));
    const propMap = new Map<string, EdmxProperty>();
    for (const p of parent.properties) {
      propMap.set(p.name, p);
    }
    for (const p of raw.properties) {
      propMap.set(p.name, p);
    }
    const navMap = new Map<string, EdmxNavigationProperty>();
    for (const n of parent.navigationProperties) {
      navMap.set(n.name, n);
    }
    for (const n of raw.navigationProperties) {
      navMap.set(n.name, n);
    }

    const merged: EdmxEntityType = {
      name: raw.name,
      baseType: raw.baseType,
      keys,
      properties: Array.from(propMap.values()),
      navigationProperties: Array.from(navMap.values()),
    };
    resolved.set(name, merged);
    return merged;
  };

  for (const name of rawTypes.keys()) {
    resolveOne(name, new Set());
  }

  return resolved;
}

/**
 * Zero-dependency OData v4 EDMX / CSDL XML parser for Azure DevOps Analytics
 * `$metadata` documents.
 */
export function parseEdmxMetadata(xmlInput: string): ParsedEdmxMetadata {
  if (typeof xmlInput !== 'string' || xmlInput.trim().length === 0) {
    throw new AzureDevOpsError(
      'Analytics $metadata response was empty; expected an OData EDMX XML document.',
    );
  }

  const cleaned = stripXmlComments(xmlInput);
  if (!/<(?:[A-Za-z_][\w.-]*:)?(?:Edmx|Schema)\b/i.test(cleaned)) {
    throw new AzureDevOpsError(
      'Analytics $metadata response did not contain a valid OData EDMX/Schema XML document.',
    );
  }

  const schemas = extractElements(cleaned, 'Schema');
  const namespace = schemas[0]?.attrs.Namespace?.trim() || undefined;

  const rawEntityTypes = new Map<string, EdmxEntityType>();
  for (const et of extractElements(cleaned, 'EntityType')) {
    const parsed = parseEntityType(et.attrs, et.body);
    if (parsed) {
      rawEntityTypes.set(parsed.name, parsed);
    }
  }

  const entityTypes = resolveEntityTypeInheritance(rawEntityTypes);

  const entitySets: EdmxEntitySet[] = [];
  const seenSets = new Set<string>();
  for (const es of extractElements(cleaned, 'EntitySet')) {
    const name = es.attrs.Name?.trim();
    const entityType = es.attrs.EntityType?.trim();
    if (!name || !entityType || seenSets.has(name)) {
      continue;
    }
    seenSets.add(name);
    entitySets.push({
      name,
      entityType,
      shortEntityType: stripNamespacePrefix(entityType),
    });
  }

  return {
    namespace,
    entitySets,
    entityTypes,
  };
}
