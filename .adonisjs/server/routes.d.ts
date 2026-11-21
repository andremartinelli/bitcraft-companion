import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'recipes.index': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'session.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'recipes.index': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'session.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'recipes.index': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}