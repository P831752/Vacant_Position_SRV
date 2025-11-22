using { cuid } from '@sap/cds/common';

service VacancyService @(path: '/odata/v4/VacancyService') {

  // Start background vacancy job
  action StartVacancyJob(
    IC       : String,
    EmpGroup : String
  ) returns {
    jobId          : String;
    totalPositions : Integer;
    totalVacancies : Integer;
    results        : many VacancyResult;
  };

  // Poll job status
  action GetJobStatus(
    jobId : String
  ) returns JobStatus;

  // Get final result
  action GetJobResult(
    jobId : String
  ) returns JobResult;

  // Types used in responses
  type VacancyResult {
    positionCode   : String;
    externalName   : String;
    effectiveStartDate : String;
    reporteeCount  : Integer;
  }

  type JobStatus {
    status   : String;
    message  : String;
    progress : Integer;
    total    : Integer;
  }

  type JobResult {
    jobId          : String;
    totalPositions : Integer;
    totalVacancies : Integer;
    results        : many VacancyResult;
  }
}