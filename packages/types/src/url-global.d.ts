// WHATWG URL exists in every runtime we target (browsers, Node); this package compiles with ES libs only.
declare class URL {
  constructor(url: string | URL, base?: string);
  hostname: string;
  pathname: string;
  protocol: string;
  readonly searchParams: {
    get(name: string): string | null;
    set(name: string, value: string): void;
  };
  toString(): string;
}
