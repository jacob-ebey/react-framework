<img width="1005" alt="image" src="https://github.com/user-attachments/assets/ed8eb0ad-f97f-47e3-91fd-340530e0ff86">

```mermaid
sequenceDiagram
    Browser->>Eyeball: Request
    par
        Note over Eyeball: Layout.eyeball()
        Note over Eyeball: Index.eyeball()
    end
    Note over Eyeball: <Shell>
    Eyeball->>Browser: Begin HTML
    par
        alt is cached
            Note over Eyeball: cache.get()
        else not cached
            Eyeball->>Layout: binding.fetch()
            Note over Layout: <LayoutRoute>
            Layout->>Eyeball: RSC
        end
    and
        alt is cached
            Note over Eyeball: cache.get()
        else not cached
            Eyeball->>Index: binding.fetch()
            Note over Index: <IndexRoute>
            Index->>Eyeball: RSC
        end
    end
    Eyeball->>Browser: End HTML
```

```mermaid
flowchart TD
    Eyeball[Eyeball Worker]
    DB[Database DruableObject]
    D1[D1 Database]
    Layout[Layout Route Worker]
    Login[Login Route Worker]
    Profile[Profile Route Worker]
    ProfileAPI[Profile API Route Worker]
    ProfileDO[Profile DurableObject]

    Eyeball o--o Layout
    Eyeball o--o Login
    Eyeball o--o Profile
    Eyeball o--o ProfileAPI
    Profile o--o ProfileDO
    ProfileAPI o--o ProfileDO
    ProfileDO o--o DB
    Login o--o DB
    DB o--o D1
```
