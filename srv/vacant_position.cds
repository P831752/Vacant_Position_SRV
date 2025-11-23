using { cuid } from '@sap/cds/common';

service VacancyService @(path:'/odata/v4/VacancyService') {

    /// Return all active Position codes filtered by IC + EmpGroup
    action GetPositionCodes(
        IC       : String,
        EmpGroup : String
    ) returns {
        codes : array of String;
    };

}
