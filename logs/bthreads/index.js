// bthreads is slightly obnoxious in that it has the idea of using process.env.BTHREADS_BACKEND to
// switch out backends, except that it only works for opting-in to 'worker_threads' on earlier
// Node versions and not for also deciding to use the child_process backend.
if (process.env.BTHREADS_BACKEND === 'child_process') {
  module.exports = require('./bthreads/processes');
} else {
  module.exports = require('./bthreads/threads');
}
