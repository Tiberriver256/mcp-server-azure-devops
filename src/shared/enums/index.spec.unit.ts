import {
  CommentThreadStatus,
  CommentType,
  GitVersionType,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  commentThreadStatusMapper,
  commentTypeMapper,
  pullRequestStatusMapper,
  gitVersionTypeMapper,
} from './index';

describe('Enum Mappers', () => {
  describe('commentThreadStatusMapper', () => {
    it('should map string values to enum values correctly', () => {
      expect(commentThreadStatusMapper.toEnum('active')).toBe(
        CommentThreadStatus.Active,
      );
      expect(commentThreadStatusMapper.toEnum('fixed')).toBe(
        CommentThreadStatus.Fixed,
      );
      expect(commentThreadStatusMapper.toEnum('wontfix')).toBe(
        CommentThreadStatus.WontFix,
      );
      expect(commentThreadStatusMapper.toEnum('closed')).toBe(
        CommentThreadStatus.Closed,
      );
      expect(commentThreadStatusMapper.toEnum('bydesign')).toBe(
        CommentThreadStatus.ByDesign,
      );
      expect(commentThreadStatusMapper.toEnum('pending')).toBe(
        CommentThreadStatus.Pending,
      );
      expect(commentThreadStatusMapper.toEnum('unknown')).toBe(
        CommentThreadStatus.Unknown,
      );
    });

    it('should map enum values to string values correctly', () => {
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.Active),
      ).toBe('active');
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.Fixed),
      ).toBe('fixed');
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.WontFix),
      ).toBe('wontfix');
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.Closed),
      ).toBe('closed');
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.ByDesign),
      ).toBe('bydesign');
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.Pending),
      ).toBe('pending');
      expect(
        commentThreadStatusMapper.toString(CommentThreadStatus.Unknown),
      ).toBe('unknown');
    });

    it('should handle case insensitive string input', () => {
      expect(commentThreadStatusMapper.toEnum('ACTIVE')).toBe(
        CommentThreadStatus.Active,
      );
      expect(commentThreadStatusMapper.toEnum('Active')).toBe(
        CommentThreadStatus.Active,
      );
    });

    it('should return undefined for invalid string values', () => {
      expect(commentThreadStatusMapper.toEnum('invalid')).toBeUndefined();
    });

    it('should return default value for invalid enum values', () => {
      expect(commentThreadStatusMapper.toString(999)).toBe('unknown');
    });
  });

  describe('commentTypeMapper', () => {
    it('should map string values to enum values correctly', () => {
      expect(commentTypeMapper.toEnum('text')).toBe(CommentType.Text);
      expect(commentTypeMapper.toEnum('codechange')).toBe(
        CommentType.CodeChange,
      );
      expect(commentTypeMapper.toEnum('system')).toBe(CommentType.System);
      expect(commentTypeMapper.toEnum('unknown')).toBe(CommentType.Unknown);
    });

    it('should map enum values to string values correctly', () => {
      expect(commentTypeMapper.toString(CommentType.Text)).toBe('text');
      expect(commentTypeMapper.toString(CommentType.CodeChange)).toBe(
        'codechange',
      );
      expect(commentTypeMapper.toString(CommentType.System)).toBe('system');
      expect(commentTypeMapper.toString(CommentType.Unknown)).toBe('unknown');
    });
  });

  describe('pullRequestStatusMapper', () => {
    it('should map string values to enum values correctly', () => {
      expect(pullRequestStatusMapper.toEnum('active')).toBe(
        PullRequestStatus.Active,
      );
      expect(pullRequestStatusMapper.toEnum('abandoned')).toBe(
        PullRequestStatus.Abandoned,
      );
      expect(pullRequestStatusMapper.toEnum('completed')).toBe(
        PullRequestStatus.Completed,
      );
    });

    it('should map enum values to string values correctly', () => {
      expect(pullRequestStatusMapper.toString(PullRequestStatus.Active)).toBe(
        'active',
      );
      expect(
        pullRequestStatusMapper.toString(PullRequestStatus.Abandoned),
      ).toBe('abandoned');
      expect(
        pullRequestStatusMapper.toString(PullRequestStatus.Completed),
      ).toBe('completed');
    });
  });

  describe('gitVersionTypeMapper', () => {
    it('should map string values to enum values correctly', () => {
      expect(gitVersionTypeMapper.toEnum('branch')).toBe(GitVersionType.Branch);
      expect(gitVersionTypeMapper.toEnum('commit')).toBe(GitVersionType.Commit);
      expect(gitVersionTypeMapper.toEnum('tag')).toBe(GitVersionType.Tag);
    });

    it('should map enum values to string values correctly', () => {
      expect(gitVersionTypeMapper.toString(GitVersionType.Branch)).toBe(
        'branch',
      );
      expect(gitVersionTypeMapper.toString(GitVersionType.Commit)).toBe(
        'commit',
      );
      expect(gitVersionTypeMapper.toString(GitVersionType.Tag)).toBe('tag');
    });
  });
});
