import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { MAX_EVENT_TEXT_LENGTH } from './catalog.ts';
import {
  normalizeAdoWebhookPayload,
  verifyWebhookAuth,
} from './webhook-normalizer.ts';

void describe('verifyWebhookAuth', () => {
  const secret = 'super-secret-webhook-key-42';
  const body = JSON.stringify({ eventType: 'git.push', resource: {} });

  void it('fails closed when secret is empty or auth headers are missing/wrong', () => {
    assert.equal(
      verifyWebhookAuth({ 'x-ado-webhook-secret': '' }, body, ''),
      false,
    );
    assert.equal(verifyWebhookAuth({}, body, secret), false);
    assert.equal(
      verifyWebhookAuth({ 'X-ADO-Webhook-Secret': 'wrong' }, body, secret),
      false,
    );
    assert.equal(
      verifyWebhookAuth(
        {
          Authorization: `Basic ${Buffer.from('ado:wrong').toString('base64')}`,
        },
        body,
        secret,
      ),
      false,
    );
    assert.equal(
      verifyWebhookAuth(
        { 'X-Webhook-Signature-256': `sha256=${'0'.repeat(64)}` },
        body,
        secret,
      ),
      false,
    );
    assert.equal(
      verifyWebhookAuth(
        { 'X-Webhook-Signature-256': 'sha256=not-hex' },
        body,
        secret,
      ),
      false,
    );
  });

  void it('accepts valid X-ADO-Webhook-Secret, Basic Auth, and HMAC-SHA256', () => {
    assert.equal(
      verifyWebhookAuth({ 'X-ADO-Webhook-Secret': secret }, body, secret),
      true,
    );

    // Basic auth with empty username (:secret) and explicit username (ado:secret)
    assert.equal(
      verifyWebhookAuth(
        {
          Authorization: `Basic ${Buffer.from(`:${secret}`).toString('base64')}`,
        },
        body,
        secret,
      ),
      true,
    );
    assert.equal(
      verifyWebhookAuth(
        {
          Authorization: `Basic ${Buffer.from(`ado:${secret}`).toString('base64')}`,
        },
        body,
        secret,
      ),
      true,
    );

    const hmac = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    assert.equal(
      verifyWebhookAuth({ 'X-Webhook-Signature-256': hmac }, body, secret),
      true,
    );
    assert.equal(
      verifyWebhookAuth(
        { 'x-webhook-signature-256': hmac },
        Buffer.from(body, 'utf8'),
        secret,
      ),
      true,
    );
  });
});

void describe('normalizeAdoWebhookPayload', () => {
  void it('recognizes ADO Test events (all-zero UUID and eventType: test) without emitting events', () => {
    const zeroUuidTest = normalizeAdoWebhookPayload({
      id: '00000000-0000-0000-0000-000000000000',
      subscriptionId: '00000000-0000-0000-0000-000000000000',
      eventType: 'git.push',
      publisherId: 'tfs',
      resource: { pushId: 1 },
    });
    assert.equal(zeroUuidTest.kind, 'test');

    const explicitTest = normalizeAdoWebhookPayload({
      id: 'wh-test-1',
      eventType: 'test',
      publisherId: 'tfs',
      resource: { isTest: true },
    });
    assert.equal(explicitTest.kind, 'test');
  });

  void it('normalizes git.push to ado.git.pushed', () => {
    const res = normalizeAdoWebhookPayload({
      id: 'evt-push-1',
      eventType: 'git.push',
      createdDate: '2026-11-25T10:00:00Z',
      resource: {
        pushId: 99,
        url: 'https://dev.azure.com/org/DemoProject/_git/DemoRepo/pushes/99',
        pushedBy: { displayName: 'Bob Developer' },
        refUpdates: [
          {
            name: 'refs/heads/main',
            newObjectId: '9999999999999999999999999999999999999999',
          },
        ],
        commits: [{ commitId: '9999999999999999999999999999999999999999' }],
        repository: {
          id: 'repo-1',
          name: 'DemoRepo',
          project: { id: 'proj-1', name: 'DemoProject' },
        },
      },
    });

    assert.equal(res.kind, 'event');
    assert.equal(res.occurrence.name, 'ado.git.pushed');
    assert.equal(res.occurrence.eventId, 'evt-push-1');
    assert.equal(res.occurrence.data.project, 'DemoProject');
    assert.equal(res.occurrence.data.repository, 'DemoRepo');
    assert.equal(res.occurrence.data.pushId, 99);
    assert.equal(res.occurrence.data.commitCount, 1);
    assert.equal(res.occurrence.data.branch, 'refs/heads/main');
  });

  void it('normalizes git.pullrequest.* and comment events to ado.pull_request.updated and truncates text <= 200', () => {
    const longTitle = `PR_${'T'.repeat(500)}`;
    const longComment = `COMMENT_${'C'.repeat(500)}`;

    const res = normalizeAdoWebhookPayload({
      id: 'evt-pr-comment',
      eventType: 'ms.vss-code.git-pullrequest-comment-event',
      createdDate: '2026-11-25T10:01:00Z',
      resource: {
        comment: { content: longComment },
        pullRequest: {
          pullRequestId: 42,
          status: 'active',
          mergeStatus: 'succeeded',
          title: longTitle,
          repository: {
            id: 'repo-1',
            name: 'DemoRepo',
            project: { id: 'proj-1', name: 'DemoProject' },
          },
        },
      },
    });

    assert.equal(res.kind, 'event');
    assert.equal(res.occurrence.name, 'ado.pull_request.updated');
    assert.equal(res.occurrence.data.pullRequestId, 42);
    assert.equal(res.occurrence.data.action, 'commented');
    const title = String(res.occurrence.data.title);
    const commentPreview = String(res.occurrence.data.commentPreview);
    assert.ok(title.length <= MAX_EVENT_TEXT_LENGTH && title.startsWith('PR_'));
    assert.ok(
      commentPreview.length <= MAX_EVENT_TEXT_LENGTH &&
        commentPreview.startsWith('COMMENT_'),
    );
  });

  void it('normalizes build.complete and ms.vss-pipelines.* events to ado.pipeline.run_state_changed', () => {
    const buildRes = normalizeAdoWebhookPayload({
      id: 'evt-build-500',
      eventType: 'build.complete',
      createdDate: '2026-11-25T10:02:00Z',
      resource: {
        id: 500,
        buildNumber: '20261125.1',
        status: 'completed',
        result: 'succeeded',
        sourceBranch: 'refs/heads/main',
        definition: { id: 10, name: 'CI-Main' },
        project: { id: 'proj-1', name: 'DemoProject' },
      },
    });
    assert.equal(buildRes.kind, 'event');
    assert.equal(buildRes.occurrence.name, 'ado.pipeline.run_state_changed');
    assert.equal(buildRes.occurrence.data.runId, 500);
    assert.equal(buildRes.occurrence.data.pipelineId, 10);
    assert.equal(buildRes.occurrence.data.state, 'completed');
    assert.equal(buildRes.occurrence.data.result, 'succeeded');

    const stageRes = normalizeAdoWebhookPayload({
      id: 'evt-stage-501',
      eventType: 'ms.vss-pipelines.stage-state-changed-event',
      createdDate: '2026-11-25T10:02:30Z',
      resourceContainers: { project: { id: 'proj-1', name: 'DemoProject' } },
      resource: {
        stage: { name: 'Deploy', state: 'completed', result: 'failed' },
        run: { id: 501, name: '20261125.2', state: 'inProgress' },
        pipeline: { id: 10, name: 'CI-Main' },
      },
    });
    assert.equal(stageRes.kind, 'event');
    assert.equal(stageRes.occurrence.data.runId, 501);
    assert.equal(stageRes.occurrence.data.stageName, 'Deploy');
    assert.equal(stageRes.occurrence.data.result, 'failed');
  });

  void it('normalizes workitem.updated and truncates 500-char title to <= 200 chars', () => {
    const longTitle = `ATTACK_${'X'.repeat(500)}`;
    const res = normalizeAdoWebhookPayload({
      id: 'evt-wi-101',
      eventType: 'workitem.updated',
      createdDate: '2026-11-25T10:03:00Z',
      resource: {
        id: 3,
        workItemId: 101,
        rev: 3,
        fields: {
          'System.State': { oldValue: 'Active', newValue: 'Resolved' },
        },
        revision: {
          id: 101,
          rev: 3,
          fields: {
            'System.TeamProject': 'DemoProject',
            'System.WorkItemType': 'User Story',
            'System.Title': longTitle,
            'System.State': 'Resolved',
          },
        },
      },
    });

    assert.equal(res.kind, 'event');
    assert.equal(res.occurrence.name, 'ado.work_item.updated');
    assert.equal(res.occurrence.data.workItemId, 101);
    assert.equal(res.occurrence.data.rev, 3);
    assert.equal(res.occurrence.data.state, 'Resolved');
    assert.equal(res.occurrence.data.previousState, 'Active');
    const title = String(res.occurrence.data.title);
    assert.ok(title.length <= 200 && title.startsWith('ATTACK_'));
  });

  void it('ignores non-object payloads and unsupported event types safely', () => {
    assert.equal(normalizeAdoWebhookPayload(null).kind, 'ignored');
    assert.equal(normalizeAdoWebhookPayload([]).kind, 'ignored');
    assert.equal(
      normalizeAdoWebhookPayload({ eventType: 'unknown.event', resource: {} })
        .kind,
      'ignored',
    );
  });
});
