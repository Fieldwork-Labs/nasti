import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { QueryClient } from "@tanstack/react-query"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const queryClient = new QueryClient()
