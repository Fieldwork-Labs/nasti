/* prettier-ignore-start */

/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file is auto-generated by TanStack Router

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as PrivateImport } from './routes/_private'
import { Route as IndexImport } from './routes/index'
import { Route as AuthLoginImport } from './routes/auth/login'
import { Route as PrivateDashboardImport } from './routes/_private/dashboard'
import { Route as PrivateTripsIndexImport } from './routes/_private/trips/index'
import { Route as PrivateSpeciesIndexImport } from './routes/_private/species/index'
import { Route as PrivateInvitationsIndexImport } from './routes/_private/invitations/index'

// Create/Update Routes

const PrivateRoute = PrivateImport.update({
  id: '/_private',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const AuthLoginRoute = AuthLoginImport.update({
  path: '/auth/login',
  getParentRoute: () => rootRoute,
} as any)

const PrivateDashboardRoute = PrivateDashboardImport.update({
  path: '/dashboard',
  getParentRoute: () => PrivateRoute,
} as any)

const PrivateTripsIndexRoute = PrivateTripsIndexImport.update({
  path: '/trips/',
  getParentRoute: () => PrivateRoute,
} as any)

const PrivateSpeciesIndexRoute = PrivateSpeciesIndexImport.update({
  path: '/species/',
  getParentRoute: () => PrivateRoute,
} as any)

const PrivateInvitationsIndexRoute = PrivateInvitationsIndexImport.update({
  path: '/invitations/',
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
    '/_private/dashboard': {
      id: '/_private/dashboard'
      path: '/dashboard'
      fullPath: '/dashboard'
      preLoaderRoute: typeof PrivateDashboardImport
      parentRoute: typeof PrivateImport
    }
    '/auth/login': {
      id: '/auth/login'
      path: '/auth/login'
      fullPath: '/auth/login'
      preLoaderRoute: typeof AuthLoginImport
      parentRoute: typeof rootRoute
    }
    '/_private/invitations/': {
      id: '/_private/invitations/'
      path: '/invitations'
      fullPath: '/invitations'
      preLoaderRoute: typeof PrivateInvitationsIndexImport
      parentRoute: typeof PrivateImport
    }
    '/_private/species/': {
      id: '/_private/species/'
      path: '/species'
      fullPath: '/species'
      preLoaderRoute: typeof PrivateSpeciesIndexImport
      parentRoute: typeof PrivateImport
    }
    '/_private/trips/': {
      id: '/_private/trips/'
      path: '/trips'
      fullPath: '/trips'
      preLoaderRoute: typeof PrivateTripsIndexImport
      parentRoute: typeof PrivateImport
    }
  }
}

// Create and export the route tree

interface PrivateRouteChildren {
  PrivateDashboardRoute: typeof PrivateDashboardRoute
  PrivateInvitationsIndexRoute: typeof PrivateInvitationsIndexRoute
  PrivateSpeciesIndexRoute: typeof PrivateSpeciesIndexRoute
  PrivateTripsIndexRoute: typeof PrivateTripsIndexRoute
}

const PrivateRouteChildren: PrivateRouteChildren = {
  PrivateDashboardRoute: PrivateDashboardRoute,
  PrivateInvitationsIndexRoute: PrivateInvitationsIndexRoute,
  PrivateSpeciesIndexRoute: PrivateSpeciesIndexRoute,
  PrivateTripsIndexRoute: PrivateTripsIndexRoute,
}

const PrivateRouteWithChildren =
  PrivateRoute._addFileChildren(PrivateRouteChildren)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '': typeof PrivateRouteWithChildren
  '/dashboard': typeof PrivateDashboardRoute
  '/auth/login': typeof AuthLoginRoute
  '/invitations': typeof PrivateInvitationsIndexRoute
  '/species': typeof PrivateSpeciesIndexRoute
  '/trips': typeof PrivateTripsIndexRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '': typeof PrivateRouteWithChildren
  '/dashboard': typeof PrivateDashboardRoute
  '/auth/login': typeof AuthLoginRoute
  '/invitations': typeof PrivateInvitationsIndexRoute
  '/species': typeof PrivateSpeciesIndexRoute
  '/trips': typeof PrivateTripsIndexRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/_private': typeof PrivateRouteWithChildren
  '/_private/dashboard': typeof PrivateDashboardRoute
  '/auth/login': typeof AuthLoginRoute
  '/_private/invitations/': typeof PrivateInvitationsIndexRoute
  '/_private/species/': typeof PrivateSpeciesIndexRoute
  '/_private/trips/': typeof PrivateTripsIndexRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | ''
    | '/dashboard'
    | '/auth/login'
    | '/invitations'
    | '/species'
    | '/trips'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | ''
    | '/dashboard'
    | '/auth/login'
    | '/invitations'
    | '/species'
    | '/trips'
  id:
    | '__root__'
    | '/'
    | '/_private'
    | '/_private/dashboard'
    | '/auth/login'
    | '/_private/invitations/'
    | '/_private/species/'
    | '/_private/trips/'
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

/* prettier-ignore-end */

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
        "/_private/dashboard",
        "/_private/invitations/",
        "/_private/species/",
        "/_private/trips/"
      ]
    },
    "/_private/dashboard": {
      "filePath": "_private/dashboard.tsx",
      "parent": "/_private"
    },
    "/auth/login": {
      "filePath": "auth/login.tsx"
    },
    "/_private/invitations/": {
      "filePath": "_private/invitations/index.tsx",
      "parent": "/_private"
    },
    "/_private/species/": {
      "filePath": "_private/species/index.tsx",
      "parent": "/_private"
    },
    "/_private/trips/": {
      "filePath": "_private/trips/index.tsx",
      "parent": "/_private"
    }
  }
}
ROUTE_MANIFEST_END */
