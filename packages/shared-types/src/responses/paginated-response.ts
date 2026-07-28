import type { Pagination } from "../pagination/pagination.js"

export interface PaginatedResponse<T>{
    data: T[]
    pagination: Pagination
}