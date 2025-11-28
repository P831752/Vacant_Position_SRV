namespace com.lt.vacant;
using { cuid, managed } from '@sap/cds/common';

entity Position_Exclude {
      key positionCode:String(15);
      positionName:String(150);
}