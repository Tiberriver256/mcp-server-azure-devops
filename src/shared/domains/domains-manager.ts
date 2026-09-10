import { Domain, ALL_DOMAINS } from './types';

/**
 * Manages enabled domains for tool filtering
 */
export class DomainsManager {
  private enabledDomains: Set<string>;

  constructor(domainsInput?: string | string[]) {
    this.enabledDomains = new Set();
    this.parseDomains(domainsInput);
  }

  private parseDomains(domainsInput?: string | string[]): void {
    if (!domainsInput) {
      this.enableAllDomains();
      return;
    }

    const domains = Array.isArray(domainsInput)
      ? domainsInput
      : domainsInput.split(',').map((d) => d.trim());

    domains.forEach((domain) => {
      if (ALL_DOMAINS.includes(domain as Domain)) {
        this.enabledDomains.add(domain);
      } else {
        // Log warning for invalid domain but continue
        process.stderr.write(`Warning: Invalid domain '${domain}' ignored\n`);
      }
    });

    // If no valid domains were found, enable all
    if (this.enabledDomains.size === 0) {
      process.stderr.write(
        'Warning: No valid domains specified, enabling all domains\n',
      );
      this.enableAllDomains();
    }
  }

  private enableAllDomains(): void {
    ALL_DOMAINS.forEach((domain) => {
      this.enabledDomains.add(domain);
    });
  }

  public isDomainEnabled(domain: string): boolean {
    return this.enabledDomains.has(domain);
  }

  public getEnabledDomains(): Set<string> {
    return new Set(this.enabledDomains);
  }
}
