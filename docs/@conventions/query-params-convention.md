# Query String Parameter Convention

This document outlines the query string parameter conventions used in our API.

## Filtering

To filter results, use query parameters that match exactly the field names in the data. For example, to filter users by name:

```
GET /users?name.eq=John
```

## Full-text Search

To perform a full-text search on all fields, use the `q` parameter:

```
GET /users?q=John
```

## Pagination

To paginate results, use the `_page` and `_limit` parameters:

```
GET /users?_page=1&_limit=10
```

## Sorting

To sort results, use the `_sort` and `_order` parameters. The `sort` parameter specifies the field to sort by, and the `order` parameter specifies the order (`asc` for ascending, `desc` for descending):

```
GET /users?sort=name&order=asc
```

## Range

To get a range of items, use the `_start` and `_end` parameters:

```
GET /users?_start=0&_end=10
```

## Example

Here is an example of a complex query that combines multiple conventions:

```
GET /users?q=John&_page=1&_limit=5&_sort=name&_order=asc
```

This query searches for users with the name "John", returns the first page with 5 results per page, and sorts the results by name in ascending order.

By following these conventions, you can effectively query and manipulate data in a consistent and predictable manner.
