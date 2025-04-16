/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as PrivateImport } from './routes/_private'
import { Route as IndexImport } from './routes/index'
import { Route as AuthLoginImport } from './routes/auth/login'
import { Route as PrivateTripsIndexImport } from './routes/_private/trips/index'
import { Route as PrivateTripsIdIndexImport } from './routes/_private/trips/$id/index'
import { Route as PrivateTripsIdCollectionsNewImport } from './routes/_private/trips/$id/collections/new'
import { Route as PrivateTripsIdCollectionsCollectionIdImport } from './routes/_private/trips/$id/collections/$collectionId'

// Create/Update Routes

const PrivateRoute = PrivateImport.update({
  id: '/_private',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const AuthLoginRoute = AuthLoginImport.update({
  id: '/auth/login',
  path: '/auth/login',
  getParentRoute: () => rootRoute,
} as any)

const PrivateTripsIndexRoute = PrivateTripsIndexImport.update({
  id: '/trips/',
  path: '/trips/',
  getParentRoute: () => PrivateRoute,
} as any)

const PrivateTripsIdIndexRoute = PrivateTripsIdIndexImport.update({
  id: '/trips/$id/',
  path: '/trips/$id/',
  getParentRoute: () => PrivateRoute,
} as any)

const PrivateTripsIdCollectionsNewRoute =
  PrivateTripsIdCollectionsNewImport.update({
    id: '/trips/$id/collections/new',
    path: '/trips/$id/collections/new',
    getParentRoute: () => PrivateRoute,
  } as any)

const PrivateTripsIdCollectionsCollectionIdRoute =
  PrivateTripsIdCollectionsCollectionIdImport.update({
    id: '/trips/$id/collections/$collectionId',
    path: '/trips/$id/collections/$collectionId',
    getParentRoute: () => PrivateRoute,
  } as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/_private': {
      id: '/_private'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof PrivateImport
      parentRoute: typeof rootRoute
    }
    '/auth/login': {
      id: '/auth/login'
      path: '/auth/login'
      fullPath: '/auth/login'
      preLoaderRoute: typeof AuthLoginImport
      parentRoute: typeof rootRoute
    }
    '/_private/trips/': {
      id: '/_private/trips/'
      path: '/trips'
      fullPath: '/trips'
      preLoaderRoute: typeof PrivateTripsIndexImport
      parentRoute: typeof PrivateImport
    }
    '/_private/trips/$id/': {
      id: '/_private/trips/$id/'
      path: '/trips/$id'
      fullPath: '/trips/$id'
      preLoaderRoute: typeof PrivateTripsIdIndexImport
      parentRoute: typeof PrivateImport
    }
    '/_private/trips/$id/collections/$collectionId': {
      id: '/_private/trips/$id/collections/$collectionId'
      path: '/trips/$id/collections/$collectionId'
      fullPath: '/trips/$id/collections/$collectionId'
      preLoaderRoute: typeof PrivateTripsIdCollectionsCollectionIdImport
      parentRoute: typeof PrivateImport
    }
    '/_private/trips/$id/collections/new': {
      id: '/_private/trips/$id/collections/new'
      path: '/trips/$id/collections/new'
      fullPath: '/trips/$id/collections/new'
      preLoaderRoute: typeof PrivateTripsIdCollectionsNewImport
      parentRoute: typeof PrivateImport
    }
  }
}

// Create and export the route tree

interface PrivateRouteChildren {
  PrivateTripsIndexRoute: typeof PrivateTripsIndexRoute
  PrivateTripsIdIndexRoute: typeof PrivateTripsIdIndexRoute
  PrivateTripsIdCollectionsCollectionIdRoute: typeof PrivateTripsIdCollectionsCollectionIdRoute
  PrivateTripsIdCollectionsNewRoute: typeof PrivateTripsIdCollectionsNewRoute
}

const PrivateRouteChildren: PrivateRouteChildren = {
  PrivateTripsIndexRoute: PrivateTripsIndexRoute,
  PrivateTripsIdIndexRoute: PrivateTripsIdIndexRoute,
  PrivateTripsIdCollectionsCollectionIdRoute:
    PrivateTripsIdCollectionsCollectionIdRoute,
  PrivateTripsIdCollectionsNewRoute: PrivateTripsIdCollectionsNewRoute,
}

const PrivateRouteWithChildren =
  PrivateRoute._addFileChildren(PrivateRouteChildren)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '': typeof PrivateRouteWithChildren
  '/auth/login': typeof AuthLoginRoute
  '/trips': typeof PrivateTripsIndexRoute
  '/trips/$id': typeof PrivateTripsIdIndexRoute
  '/trips/$id/collections/$collectionId': typeof PrivateTripsIdCollectionsCollectionIdRoute
  '/trips/$id/collections/new': typeof PrivateTripsIdCollectionsNewRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '': typeof PrivateRouteWithChildren
  '/auth/login': typeof AuthLoginRoute
  '/trips': typeof PrivateTripsIndexRoute
  '/trips/$id': typeof PrivateTripsIdIndexRoute
  '/trips/$id/collections/$collectionId': typeof PrivateTripsIdCollectionsCollectionIdRoute
  '/trips/$id/collections/new': typeof PrivateTripsIdCollectionsNewRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/_private': typeof PrivateRouteWithChildren
  '/auth/login': typeof AuthLoginRoute
  '/_private/trips/': typeof PrivateTripsIndexRoute
  '/_private/trips/$id/': typeof PrivateTripsIdIndexRoute
  '/_private/trips/$id/collections/$collectionId': typeof PrivateTripsIdCollectionsCollectionIdRoute
  '/_private/trips/$id/collections/new': typeof PrivateTripsIdCollectionsNewRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | ''
    | '/auth/login'
    | '/trips'
    | '/trips/$id'
    | '/trips/$id/collections/$collectionId'
    | '/trips/$id/collections/new'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | ''
    | '/auth/login'
    | '/trips'
    | '/trips/$id'
    | '/trips/$id/collections/$collectionId'
    | '/trips/$id/collections/new'
  id:
    | '__root__'
    | '/'
    | '/_private'
    | '/auth/login'
    | '/_private/trips/'
    | '/_private/trips/$id/'
    | '/_private/trips/$id/collections/$collectionId'
    | '/_private/trips/$id/collections/new'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  PrivateRoute: typeof PrivateRouteWithChildren
  AuthLoginRoute: typeof AuthLoginRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  PrivateRoute: PrivateRouteWithChildren,
  AuthLoginRoute: AuthLoginRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/_private",
        "/auth/login"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/_private": {
      "filePath": "_private.tsx",
      "children": [
        "/_private/trips/",
        "/_private/trips/$id/",
        "/_private/trips/$id/collections/$collectionId",
        "/_private/trips/$id/collections/new"
      ]
    },
    "/auth/login": {
      "filePath": "auth/login.tsx"
    },
    "/_private/trips/": {
      "filePath": "_private/trips/index.tsx",
      "parent": "/_private"
    },
    "/_private/trips/$id/": {
      "filePath": "_private/trips/$id/index.tsx",
      "parent": "/_private"
    },
    "/_private/trips/$id/collections/$collectionId": {
      "filePath": "_private/trips/$id/collections/$collectionId.tsx",
      "parent": "/_private"
    },
    "/_private/trips/$id/collections/new": {
      "filePath": "_private/trips/$id/collections/new.tsx",
      "parent": "/_private"
    }
  }
}
ROUTE_MANIFEST_END */
