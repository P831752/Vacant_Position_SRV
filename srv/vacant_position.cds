using { cuid } from '@sap/cds/common';
using com.lt.vacant as my from '../db/vacant-schema';

service VacancyService @(path:'/odata/v4/VacancyService') {

      entity Position_Exclude       as projection on my.Position_Exclude;
      action PositionExclude(vacancies: many Position_Exclude) returns Result;

    /// Return all active Position codes filtered by IC + EmpGroup
    action GetPositionCodes(
        IC       : String,
        EmpGroup : String,
        Button   : String
    ) returns {
        codes : array of String;
    };
}

type Result {
    status: String;
    count: Integer;
}