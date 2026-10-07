import { expect, it } from 'vitest';
import { createStarmapRuntime } from '../desktop/renderer/pipeline/office/world';
import { DEMO_IDENTITIES } from '../desktop/renderer/pipeline/office/identities';

it('flood connectivity rejects a separated required whiteboard without weakening footprint validation', () => {
  const runtime = createStarmapRuntime(DEMO_IDENTITIES);
  const world = runtime.readWorld();
  world.blockedAreas = [{ id: 'wall', name: '隔断', bounds: { left: 9, top: 0, right: 10, bottom: world.height } }];
  expect(() => runtime.navigation.validate(world)).toThrow('家具入口与必需互动格之间没有连通的通道');
  const overlap = runtime.readWorld(); overlap.props[1].position = overlap.props[0].position;
  expect(() => runtime.navigation.validate(overlap)).toThrow('占用了同一格');
  runtime.dispose();
});
