// The app-wide asset library: bundled open-license assets plus images the user imported.
// An item is offered to the AI only when its terms are recorded (status 'confirmed').
export type LibraryKind = 'icon' | 'illustration' | 'photo';
export type LibraryLicense = {
  name: string; sourceUrl: string; status: 'confirmed' | 'unconfirmed';
  creditRequired: boolean; creditText?: string;
  // The terms ask for the credit next to where the asset is used, not only on the credits page.
  nearUse?: boolean;
  limitNote?: string;
};
export type LibraryItem = {key: string; kind: LibraryKind; title: string; description: string; tags: string[]; license: LibraryLicense};
export type LibraryItemView = LibraryItem & {previewUrl?: string; addedAt: number};
export type LibraryState = {imported: LibraryItemView[]; bundled: Array<{name: string; license: string; count: number; sourceUrl: string}>};
export type LibraryPatch = Partial<Pick<LibraryItem, 'kind' | 'title' | 'description' | 'tags' | 'license'>>;

// What must be recorded before an imported item may be offered.
export function licenseProblems(l: LibraryLicense): string[] {
  const problems: string[] = [];
  if (!l.name.trim()) problems.push('ライセンス（利用規約の名前）を書いてください');
  if (!/^https?:\/\/\S+$/.test(l.sourceUrl.trim())) problems.push('出典のURLを書いてください');
  if (l.creditRequired && !l.creditText?.trim()) problems.push('クレジットが必要なら、表記する文を書いてください');
  return problems;
}
