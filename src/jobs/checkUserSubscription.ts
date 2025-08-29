import { registerJob } from 'wasp/server/jobs/core/pgBoss'
import { updateUserSubscription } from '../../../../../src/server/workers/updateUserSubscription.js'
import { checkUserSubscription as _waspJobDefinition } from 'wasp/server/jobs'

registerJob({
  job: _waspJobDefinition,
  jobFn: updateUserSubscription,
})
