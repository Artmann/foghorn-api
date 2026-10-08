import { BaseModel } from 'esix'

// One document per job runner process. The runner updates `lastSeenAt` while
// it's alive so the API can tell whether anything is processing jobs.
export class JobRunner extends BaseModel {
  public name = ''
  public lastSeenAt = 0
  public startedAt = 0
  public stoppedAt: number | null = null
}
