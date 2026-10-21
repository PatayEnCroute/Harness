# Points d'exécution SQL par stack

Un sink est **à remonter** quand la requête qu'il reçoit est construite par concaténation, `format`, interpolation ou template de chaîne, et que l'API ne paramètre pas elle-même les valeurs interpolées. Les listes ne sont pas exhaustives : un wrapper maison autour de ces API est un sink lui aussi.

| Stack | À remonter (si la requête n'est pas constante) | Sûr (paramètres liés) |
|---|---|---|
| **.NET** | `FromSqlRaw`, `ExecuteSqlRaw(Async)`, `SqlQueryRaw`, `SqlCommand`/`DbCommand.CommandText` construit par `+`, `string.Format` ou `$"…"`, Dapper `Query`/`Execute` avec une chaîne interpolée | `FromSql($"…")`, `FromSqlInterpolated`, `ExecuteSql($"…")`, `SqlQuery($"…")` (EF Core paramètre l'interpolation) ; `SqlParameter` ; Dapper avec objet de paramètres ; LINQ |
| **Node** | `query(\`…${x}…\`)` (pg, mysql2, mssql), `knex.raw` et `whereRaw` avec concaténation, `sequelize.query` sans `replacements`/`bind`, `prisma.$queryRawUnsafe`, `$executeRawUnsafe`, TypeORM `query()` et `.where("… " + x)` | `query(text, [values])`, `knex.raw('?', [x])`, `` prisma.$queryRaw`…${x}…` `` (template balisé), `replacements`/`bind`, `.where("a = :a", { a })` |
| **Python** | `cursor.execute` avec f-string, `%` ou `.format`, SQLAlchemy `text()` construit par formatage, Django `.raw()`, `.extra()`, `RawSQL`, `cursor.execute` dans une vue | `cursor.execute(sql, params)`, `text("… :a").bindparams(a=x)`, ORM (Django, SQLAlchemy) |
| **Java / Kotlin** | `Statement.execute*` avec concaténation, `createQuery`/`createNativeQuery` concaténés (JPQL et HQL s'injectent aussi), MyBatis `${…}`, `JdbcTemplate` avec concaténation, `@Query` avec SpEL non échappé | `PreparedStatement`, `setParameter`, MyBatis `#{…}`, `JdbcTemplate` avec arguments, Criteria API |
| **Go** | `db.Query`/`Exec`/`QueryRow` avec `fmt.Sprintf` ou `+`, GORM `Raw`/`Exec`/`Where` avec chaîne construite, `Order(x)` | `db.Query(sql, args...)`, GORM `Where("a = ?", x)` |
| **Rust** | `sqlx::query(&format!(…))`, `diesel::sql_query(format!(…))` | `sqlx::query!`, `.bind(x)`, DSL Diesel |
| **PHP** | `mysqli_query`/`PDO::query` avec concaténation, `DB::raw`, `whereRaw`, `orderByRaw` construits | `prepare` + `execute`, bindings Eloquent |
| **Ruby** | `where("… #{x}")`, `find_by_sql`, `order(params[…])`, `execute` avec interpolation | `where(a: x)`, `where("a = ?", x)` |
| **SQL** | `EXEC(@sql)`, `sp_executesql` avec concaténation, `EXECUTE format('…%s…')` (PostgreSQL), `PREPARE … FROM` avec `CONCAT` (MySQL) | `sp_executesql` avec paramètres, `format('%I', …)` et `%L` (identifiant et littéral échappés) |

## Identifiants dynamiques

Nom de table ou de colonne, sens de tri, `ORDER BY`, `LIMIT` reçu en texte : aucun driver ne les paramètre. Sûrs seulement s'ils sont choisis dans une liste blanche fermée (`switch`, dictionnaire, enum), jamais par simple échappement ou expression régulière permissive.

## Sources non fiables à remonter

Paramètres et corps de requête HTTP, en-têtes, cookies, arguments de ligne de commande, fichiers importés, messages de file ou d'événement, variables d'environnement venant d'un tiers, et valeurs relues en base qui venaient d'un utilisateur (injection de second ordre).
