import {describe, expect, it, vi} from 'vitest';
import {TextRefiner} from '../src/main/text-refiner';
import type {LivePage} from '../src/shared/live-edit';

const page = {elements: [{id: 'text', text: '30人で2週間試行する'}]} as LivePage;
const input = {snapshotId: 's', elementId: 'text', text: '30人で2週間試行する', direction: '短くする'};
describe('focused AI text refinement', () => {
  it('rejects changed numeric facts before accepting suggestions', async () => {
    let refiner: TextRefiner;
    const run = vi.fn(async (prompt: string, _settings: unknown, tool: string) => {
      const id = /requestId "([^"]+)"/.exec(prompt)![1]!;
      if (tool === 'submit_text_refinement_review') {
        expect(await refiner.submitReview({requestId: id, accepted: [0], rejected: [{index: 1, reason: '手順が変わる'}]})).toEqual([]);
        return {ok: true, seconds: 1, models: []};
      }
      expect(await refiner.submit({requestId: id, options: [{label: 'a', text: '40人で2週間試行', reason: '短く'}, {label: 'b', text: '2週間、30人で試行', reason: '期間を先に'}]})).toHaveLength(1);
      expect(await refiner.submit({requestId: id, options: [{label: 'a', text: '30人で2週間試行', reason: '短く'}, {label: 'b', text: '2週間、30人で試行', reason: '期間を先に'}]})).toEqual([]);
      return {ok: true, seconds: 1, models: []};
    });
    refiner = new TextRefiner({run, cancelAll: vi.fn()});
    expect((await refiner.refine(input, page, null)).options).toHaveLength(1);
    expect(run.mock.calls[0]![0]).toContain('否定');
    expect(await refiner.submit({requestId: 'expired', options: []})).not.toEqual([]);
  });
  it('does not return a cancelled result or accept a late tool submission', async () => {
    let refiner: TextRefiner;
    const runner = {run: vi.fn(async (prompt: string) => {
      const id = /requestId "([^"]+)"/.exec(prompt)![1]!;
      refiner.cancel();
      expect(await refiner.submit({requestId: id, options: [{label: 'a', text: input.text, reason: 'a'}, {label: 'b', text: '2週間、30人で試行', reason: 'b'}]})).toEqual(['この依頼は終了しています']);
      return {ok: false, seconds: 1, models: [], error: 'cancelled'};
    }), cancelAll: vi.fn()};
    refiner = new TextRefiner(runner);
    expect((await refiner.refine(input, page, null)).ok).toBe(false);
    expect(runner.cancelAll).toHaveBeenCalledOnce();
  });
});
