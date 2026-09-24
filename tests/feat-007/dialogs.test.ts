import { test, expect, vi } from 'vitest';
import { h } from 'vue';
import { mount, settle, textOf } from '../bug-001/renderer';

vi.mock('../../src/stores/context', () => ({ useContextStore: () => ({ schoolYears: [] }) }));

/**
 * Both dialogs died on open with "Cannot access 'touched' before initialization":
 * a `watch(..., {immediate:true})` whose callback ran during setup() and touched
 * a `const` declared further down. The static scanner in
 * tests/immediate-watcher-tdz.test.mjs keeps the shape out; these two mount the
 * real components, because a text check can always be out-thought.
 */
const dialogs = [
  ['AdminUserDialog', () => import('../../src/components/admin/AdminUserDialog.vue'),
    { open: true, kind: 'learner' as const, saving: false, error: '' }],
  ['StudentAccountDialog', () => import('../../src/components/students/StudentAccountDialog.vue'),
    { open: true, saving: false, error: '' }],
] as const;

for (const [name, load, props] of dialogs) {
  test(`${name} opens without throwing`, async () => {
    const component = (await load()).default;
    const errors: unknown[] = [];
    const view = mount({ render: () => h(component as never, props as never) });
    view.app.config.errorHandler = error => { errors.push(error) };
    await settle();
    expect(errors).toEqual([]);
    // And it actually rendered something, so the test is not passing on an
    // empty tree that never ran setup.
    expect(textOf(view.root).length).toBeGreaterThan(0);
    view.app.unmount();
  });
}
