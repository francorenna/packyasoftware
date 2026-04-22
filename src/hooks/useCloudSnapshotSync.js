import { useEffect } from 'react'
import { enqueueCloudSnapshot, processCloudSyncQueue } from '../utils/cloudSync'

function useCloudSnapshotSync(entity, snapshot) {
  useEffect(() => {
    const didEnqueue = enqueueCloudSnapshot(entity, snapshot)
    if (didEnqueue) {
      void processCloudSyncQueue()
    }
  }, [entity, snapshot])
}

export default useCloudSnapshotSync
