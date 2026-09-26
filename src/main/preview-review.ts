import {createHash, randomUUID} from 'node:crypto';
import {VariantInputSchema, type VariantInput} from '@shared/element';

const fingerprint = (v: VariantInput) => createHash('sha256').update(JSON.stringify(VariantInputSchema.parse(v))).digest('hex');
// A receipt refers to exactly the draft that was rendered without clipping. Modifying any
// content invalidates it. One receipt per request keeps retries bounded in memory.
export class PreviewReviews {
  private reviews = new Map<string, {token: string; hash: string}>();
  record(v: VariantInput, problems: string[]): string | undefined {
    this.clear(v.requestId);
    if (problems.length) return undefined;
    const token = randomUUID();
    this.reviews.set(v.requestId, {token, hash: fingerprint(v)});
    return token;
  }
  accepts(v: VariantInput, token: string | undefined): boolean {
    const review = this.reviews.get(v.requestId);
    return !!review && review.token === token && review.hash === fingerprint(v);
  }
  clear(id: string) { this.reviews.delete(id); }
}
