'use strict';

/**
 * Hikvision ISAPI endpoint paths used by the attendance integration.
 */

module.exports = {
  DEVICE_INFO: '/ISAPI/System/deviceInfo',
  ACS_EVENT: '/ISAPI/AccessControl/AcsEvent',
  ACS_EVENT_CAPABILITIES: '/ISAPI/AccessControl/AcsEvent/capabilities',
  USER_INFO_COUNT: '/ISAPI/AccessControl/UserInfo/Count',
  USER_INFO_SEARCH: '/ISAPI/AccessControl/UserInfo/Search',
  USER_INFO_RECORD: '/ISAPI/AccessControl/UserInfo/Record',
  USER_INFO_MODIFY: '/ISAPI/AccessControl/UserInfo/Modify',
  USER_INFO_DELETE: '/ISAPI/AccessControl/UserInfo/Delete',
};
