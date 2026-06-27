// E2E fixtures entry point (T126). Feature specs import the auth-aware `test`
// + `expect` and the leader storage-state path from here. Domain seeding lives
// server-side and runs in Playwright global setup (see `auth.ts`).
export {
  expect,
  LEADER_STORAGE_STATE,
  SUB_LEADER_STORAGE_STATE,
  signUpLeader,
  test,
} from './auth';
