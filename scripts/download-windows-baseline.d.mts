export function selectWindowsBaseline(releases: {
  tag_name: string; draft?: boolean; prerelease?: boolean; assets?: { name: string }[];
}[], current: string): { tag: string; version: string; asset: string };
export function verifyBaselineChecksum(bytes: Buffer, manifest: string, asset: string): void;
