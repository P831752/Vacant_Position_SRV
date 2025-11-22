const cds = require("@sap/cds");

// In-memory job store. For productive use you’d move this to DB.
const jobStore = new Map();

module.exports = cds.service.impl(function () {

  /**
   * 1️⃣ StartVacancyJob – kicks off async job and returns jobId immediately
   */
  this.on("StartVacancyJob", async (req) => {
    const { IC, EmpGroup } = req.data;

    if (!IC || !EmpGroup) {
      req.error(400, "IC and EmpGroup are required");
    }

    const jobId = cds.utils.uuid();

    // Initial job state
    jobStore.set(jobId, {
      status: "RUNNING",
      message: "Job started...",
      progress: 0,
      total: 0,
      totalVacancies: 0,
      results: []
    });

    console.log(`\n============== VACANCY JOB START ==============\n`);
    console.log(`[${jobId}] Starting with filters: IC=${IC}, EmpGroup=${EmpGroup}`);

    // Fire-and-forget async processing
    processVacancyJob(jobId, IC, EmpGroup)
      .catch(err => {
        console.error(`[${jobId}] ❌ Unhandled error in processVacancyJob:`, err);
        const job = jobStore.get(jobId);
        if (job) {
          job.status = "ERROR";
          job.message = err.message || "Unexpected error during vacancy job";
        }
      });

    // Immediate response
    return {
      jobId,
      totalPositions: 0,
      totalVacancies: 0,
      results: []
    };
  });

  /**
   * 2️⃣ GetJobStatus – polled by UI5
   */
  this.on("GetJobStatus", async (req) => {
    const { jobId } = req.data;

    const job = jobStore.get(jobId);
    if (!job) {
      return {
        status: "ERROR",
        message: "Invalid jobId",
        progress: 0,
        total: 0
      };
    }
    // Only send status fields, not full results
    return {
      status: job.status,
      message: job.message,
      progress: job.progress,
      total: job.total
    };
  });

  /**
   * 3️⃣ GetJobResult – called by UI5 when status === SUCCESS
   */
  this.on("GetJobResult", async (req) => {
    const { jobId } = req.data;

    const job = jobStore.get(jobId);
    if (!job) {
      req.error(404, `No job found for jobId=${jobId}`);
    }

    return {
      jobId,
      totalPositions: job.total,
      totalVacancies: job.totalVacancies,
      results: job.results
    };
  });

});


/**
 * 🔧 Core job logic – runs outside the request lifecycle
 */
async function processVacancyJob(jobId, IC, EmpGroup) {
  const sf = await cds.connect.to("sf_dest");
  const job = jobStore.get(jobId);

  if (!job) return;

  try {
    // 1️⃣ Fetch positions
    job.message = "Fetching Positions from SuccessFactors...";
    const positions = await fetchAllPositions(sf, jobId, IC, EmpGroup);
    job.total = positions.length;
    console.log(`[${jobId}] ✔ Total Positions = ${positions.length}`);

    // 2️⃣ Determine vacancies (EmpJob)
    job.message = "Determining vacancy status...";
    const vacancies = await determineVacancies(sf, jobId, positions, job);
    job.totalVacancies = vacancies.length;
    console.log(`[${jobId}] ✔ Vacancy Count = ${vacancies.length}`);

    // 3️⃣ Fetch reportee counts
    job.message = "Fetching reportee counts...";
    const enriched = await fetchReportees(sf, jobId, vacancies);

    job.results = enriched;
    job.status = "SUCCESS";
    job.message = `Job completed successfully. Vacancies found: ${enriched.length}`;
    console.log(`[${jobId}] Job completed. Vacancies Found: ${enriched.length}`);

  } catch (err) {
    console.error(`[${jobId}] ❌ Error in processVacancyJob:`, err);
    job.status = "ERROR";
    job.message = err.message || "Error while running vacancy job";
  }
}


/**
 * Fetch all positions with filters, paged
 */
async function fetchAllPositions(sf, jobId, IC, EmpGroup) {
  let all = [];
  let skip = 0;
  const pageSize = 2000;

  console.log(`[${jobId}] Fetching Positions from SF...`);

  while (true) {
    const url =
      `/odata/v2/Position?$skip=${skip}&$top=${pageSize}` +
      `&$filter=businessUnit eq '${IC}' and cust_EmployeeGroup eq '${EmpGroup}' and effectiveStatus eq 'A'` +
      `&$select=code,externalName_defaultValue,effectiveStartDate,parentPosition/code` +
      `&$expand=parentPosition`;

    const res = await sf.send({ method: "GET", path: url });
    const rows = res.d.results || [];

    console.log(`[${jobId}] Retrieved ${rows.length} rows (skip=${skip})`);
    all.push(...rows);

    if (rows.length < pageSize) break;
    skip += pageSize;
  }

  return all;
}


/**
 * Determine which positions are vacant using EmpJob
 */
async function determineVacancies(sf, jobId, positions, job) {
  console.log(`[${jobId}] Checking vacancy status for ${positions.length} positions...`);

  const vacancies = [];
  const concurrency = 10;
  let idx = 0;

  async function worker() {
    while (true) {
      const currentIndex = idx++;
      if (currentIndex >= positions.length) break;

      const pos = positions[currentIndex];
      const code = pos.code;

            const url =
            `/odata/v2/EmpJob?fromDate=1900-01-01` +
            `&$filter=position eq '${code}'` +
            `&$orderby=startDate desc&$top=1` +
            `&$select=emplStatus,startDate`;

      try {
        const res = await sf.send({ method: "GET", path: url });
        const rows = res.d.results || [];

        let isVacant = false;
        if (rows.length === 0) {
          isVacant = true;
        } else {
          const status = rows[0].emplStatus;
          if (status !== "6021" && status !== "6025") {
            isVacant = true;
          }
        }

        if (isVacant) {
          vacancies.push(pos);
        }

      } catch (err) {
        console.error(`[${jobId}] EmpJob error for position ${code}:`, err.message);
        // On error, treat as non-vacant OR vacant, depending on business rule.
        // Here we skip adding to vacancies.
      }

      job.progress = currentIndex + 1;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return vacancies;
}


/**
 * Fetch reportee count for each vacant position
 */
async function fetchReportees(sf, jobId, vacancies) {
  console.log(`[${jobId}] Fetching reportees for ${vacancies.length} vacancies...`);

  const results = [];
  const concurrency = 10;
  let idx = 0;

  async function worker() {
    while (true) {
      const currentIndex = idx++;
      if (currentIndex >= vacancies.length) break;

      const pos = vacancies[currentIndex];
      const code = pos.code;

      const url =
        `/odata/v2/Position?$filter=parentPosition/code eq '${code}' and effectiveStatus eq 'A'` +
        `&$select=code`;

      try {
        const res = await sf.send({ method: "GET", path: url });
        const children = res.d.results || [];

        results.push({
          positionCode: code,
          externalName: pos.externalName_defaultValue,
          effectiveStartDate: pos.effectiveStartDate,
          reporteeCount: children.length
        });

      } catch (err) {
        console.error(`[${jobId}] Reportee error for position ${code}:`, err.message);
        results.push({
          positionCode: code,
          externalName: pos.externalName_defaultValue,
          effectiveStartDate: pos.effectiveStartDate,
          reporteeCount: 0
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(`[${jobId}] ✔ Reportee data completed.`);
  return results;
}