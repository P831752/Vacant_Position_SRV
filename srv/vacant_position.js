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
            `&$select=code`;

        const res = await sf.send({ method: "GET", path: url });
        const rows = res.d?.results || [];

        console.log(`Retrieved ${rows.length} rows (skip=${skip})`);

        rows.forEach(r => all.push(r.code));

        if (rows.length < pageSize) break;
        skip += pageSize;
    }

    console.log(`Total Position Codes = ${all.length}`);

    return { codes: all };   // <-- IMPORTANT
});
