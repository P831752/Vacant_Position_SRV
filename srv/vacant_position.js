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
        const pageSize = 1000;

        console.log(`📌 GetPositionCodes(IC=${IC}, EmpGroup=${EmpGroup})`);
        console.log(`Fetching Positions from SF...`); 

    let filter = "effectiveStatus eq 'A'";
    if (IC && EmpGroup) {
        filter += ` and businessUnit eq '${IC}' and cust_EmployeeGroup eq '${EmpGroup}'`;
    } else if (IC) {
        filter += ` and businessUnit eq '${IC}'`;
    } else if (EmpGroup) {
        filter += ` and cust_EmployeeGroup eq '${EmpGroup}'`;
    }
    // If both are empty, only filter by effectiveStatus

    while (true) {
        const url =
            `/odata/v2/Position?$skip=${skip}&$top=${pageSize}` +
            `&$filter=${filter}` +
            `&$select=code,externalName_defaultValue,effectiveStartDate,businessUnit,parentPosition/code` +
            `&$expand=parentPosition`;

            const res = await sf.send({ method: "GET", path: url });
            const rows = res.d?.results ?? [];

            console.log(`→ Retrieved ${rows.length} rows (skip=${skip})`);

            all.push(...rows);

            if (rows.length < pageSize) break;
            skip += pageSize;
        }

        console.log(`✔ Total Positions Loaded = ${all.length}`);

        // Return only needed fields (UI5 friendly)
        const data = all.map(p => ({
            code: p.code,
            externalName: p.externalName_defaultValue || "",
            startDate: p.effectiveStartDate || null,
            parentPosition: p.parentPosition?.code || null,
            ic: p.businessUnit || ""
        }));

        console.log(`✔ Returning ${data.length} minimal-position objects`);

        return { codes: data };
    });

});