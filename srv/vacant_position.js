const cds = require("@sap/cds");

module.exports = cds.service.impl(async function () {

    const sf = await cds.connect.to("sf_dest");

    // -----------------------------
    // ACTION: GetPositionCodes
    // -----------------------------
    this.on("GetPositionCodes", async req => {
        const { IC, EmpGroup } = req.data;

        let skip = 0;
        const top = 1000;
        let hasMore = true;
        const allCodes = [];

        while (hasMore) {
            const { d } = await sf.send({
                method: "GET",
                path:
                    `/odata/v2/Position?$top=${top}&$skip=${skip}`
                    + `&$filter=businessUnit eq '${IC}' and cust_EmployeeGroup eq '${EmpGroup}' and effectiveStatus eq 'A'`
                    + `&$select=code`
            });

            if (!d || !d.results || d.results.length === 0) break;

            d.results.forEach(pos => allCodes.push(pos.code));

            if (d.results.length < top) hasMore = false;
            skip += top;
        }

        return { codes: allCodes };
    });

});
