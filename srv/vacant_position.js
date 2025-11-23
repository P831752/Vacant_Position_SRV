const cds = require("@sap/cds");

module.exports = cds.service.impl(async function () {

    const sf = await cds.connect.to("sf_dest");

    // -----------------------------
    // ACTION: GetPositionCodes
    // -----------------------------
    this.on("GetPositionCodes", async req => {
        const { IC, EmpGroup } = req.data;

    let all = [];
    let skip = 0;
    const pageSize = 100;

    console.log(`Fetching Positions from SF...`);

    while (true) {
        const url =
            `/odata/v2/Position?$skip=${skip}&$top=${pageSize}` +
            `&$filter=businessUnit eq '${IC}' and cust_EmployeeGroup eq '${EmpGroup}' and effectiveStatus eq 'A'` +
            `&$select=code,externalName_defaultValue,parentPosition/code` +
            `&$expand=parentPosition`;

        const res = await sf.send({ method: "GET", path: url });
        const rows = res.d.results;

        console.log(`Retrieved ${rows.length} rows (skip=${skip})`);

        all.push(...rows);

        if (rows.length < pageSize) break;
        skip += pageSize;
    }

    console.log(`Total Positions = ${all.length}`);
    return all;
    });

});
