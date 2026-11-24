import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'recipes.index': { paramsTuple?: []; params?: {} }
    'items.index': { paramsTuple?: []; params?: {} }
    'items.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'calculator.show': { paramsTuple?: []; params?: {} }
    'plans.index': { paramsTuple?: []; params?: {} }
    'plans.store': { paramsTuple?: []; params?: {} }
    'plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plans.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'quick_plans.store': { paramsTuple?: []; params?: {} }
    'inventory.index': { paramsTuple?: []; params?: {} }
    'inventory.sync': { paramsTuple?: []; params?: {} }
    'game_players.index': { paramsTuple?: []; params?: {} }
    'game_players.store': { paramsTuple?: []; params?: {} }
    'game_players.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'session.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'recipes.index': { paramsTuple?: []; params?: {} }
    'items.index': { paramsTuple?: []; params?: {} }
    'items.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'calculator.show': { paramsTuple?: []; params?: {} }
    'plans.index': { paramsTuple?: []; params?: {} }
    'plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'inventory.index': { paramsTuple?: []; params?: {} }
    'game_players.index': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'session.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'recipes.index': { paramsTuple?: []; params?: {} }
    'items.index': { paramsTuple?: []; params?: {} }
    'items.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'calculator.show': { paramsTuple?: []; params?: {} }
    'plans.index': { paramsTuple?: []; params?: {} }
    'plans.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'inventory.index': { paramsTuple?: []; params?: {} }
    'game_players.index': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'session.store': { paramsTuple?: []; params?: {} }
    'plans.store': { paramsTuple?: []; params?: {} }
    'quick_plans.store': { paramsTuple?: []; params?: {} }
    'inventory.sync': { paramsTuple?: []; params?: {} }
    'game_players.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'plans.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'plans.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'game_players.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}