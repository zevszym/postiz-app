# Claude Code - Wiedza o projekcie Postiz

## Przegląd projektu

Postiz to aplikacja do zarządzania i planowania postów w mediach społecznościowych. Obsługuje 28 platform (Facebook, Instagram, X/Twitter, LinkedIn, TikTok, YouTube, i wiele innych).

## Struktura projektu

```
postiz-app/
├── apps/
│   ├── backend/          # NestJS API
│   ├── frontend/         # Next.js frontend
│   ├── orchestrator/     # Temporal worker
│   └── extension/        # Browser extension
├── libraries/
│   ├── nestjs-libraries/ # Współdzielone moduły NestJS
│   │   ├── src/
│   │   │   ├── chat/     # Serwer MCP i narzędzia AI
│   │   │   ├── database/ # Prisma, repozytoria, serwisy
│   │   │   ├── integrations/ # Providery platform (28 platform)
│   │   │   └── ...
│   └── react-shared-libraries/
└── var/docker/           # Konfiguracja Docker
```

## Serwer MCP (Model Context Protocol)

Serwer MCP pozwala agentom AI na zarządzanie postami przez API.

**Lokalizacja:** `libraries/nestjs-libraries/src/chat/`

**Dokumentacja:** `libraries/nestjs-libraries/src/chat/MCP_TOOLS.md`

### Dostępne narzędzia MCP:

| Narzędzie | Opis | Plik |
|-----------|------|------|
| `integrationList` | Lista kanałów | `integration.list.tool.ts` |
| `integrationSchema` | Reguły platformy | `integration.validation.tool.ts` |
| `integrationTrigger` | Dynamiczne dane | `integration.trigger.tool.ts` |
| `schedulePostTool` | Tworzenie postów | `integration.schedule.post.ts` |
| `postsList` | Lista postów | `posts.list.tool.ts` |
| `postGet` | Szczegóły posta | `post.get.tool.ts` |
| `postUpdate` | Zmiana daty | `post.update.tool.ts` |
| `postEdit` | Edycja treści | `post.edit.tool.ts` |
| `postDelete` | Usuwanie | `post.delete.tool.ts` |
| `generateImageTool` | Generowanie obrazów | `generate.image.tool.ts` |
| `generateVideoTool` | Generowanie wideo | `generate.video.tool.ts` |

### Dodawanie nowego narzędzia MCP:

1. Utwórz plik `nazwatools.tool.ts` w `libraries/nestjs-libraries/src/chat/tools/`
2. Zaimplementuj `AgentToolInterface`
3. Użyj `@Injectable()` i `createTool()` z `@mastra/core/tools`
4. Dodaj do `tool.list.ts`
5. Narzędzie zostanie automatycznie zarejestrowane (spread w `chat.module.ts`)

## Baza danych

**ORM:** Prisma

**Schema:** `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

**Główne modele:**
- `Integration` - kanały/integracje z platformami
- `Post` - posty (stan: QUEUE, DRAFT, PUBLISHED, ERROR)
- `Organization` - organizacje/workspace
- `User` - użytkownicy

## Workflow publikacji

1. Post tworzony w stanie QUEUE lub DRAFT
2. Temporal workflow (`postWorkflowV101`) zarządza publikacją
3. Worker pobiera posty do publikacji i wysyła przez provider platformy
4. Stan zmienia się na PUBLISHED lub ERROR

## Komendy

```bash
# Development
pnpm run dev              # Uruchom wszystkie aplikacje
pnpm run dev:backend      # Tylko backend
pnpm run dev:frontend     # Tylko frontend

# Build
pnpm run build            # Build wszystkiego
pnpm run build:backend    # Tylko backend

# Database
pnpm run prisma-generate  # Generuj klienta Prisma
pnpm run prisma-db-push   # Push schema do bazy
```

## Integracje platform

**Lokalizacja:** `libraries/nestjs-libraries/src/integrations/social/`

Każda platforma ma swój provider (np. `facebook.provider.ts`) który:
- Rozszerza `SocialAbstract`
- Implementuje `SocialProvider`
- Ma dekorator `@Rules()` z opisem ograniczeń
- Ma klasę DTO dla ustawień

## Ważne pliki konfiguracyjne

- `package.json` - skrypty i zależności
- `tsconfig.json` - konfiguracja TypeScript
- `.env` - zmienne środowiskowe (nie commitować!)

## Tips dla Claude

1. Przy modyfikacji narzędzi MCP - pamiętaj o aktualizacji `MCP_TOOLS.md`
2. Providery platform są w `integrations/social/` - każdy plik to jedna platforma
3. Serwisy bazy są w `database/prisma/` - `*.service.ts` i `*.repository.ts`
4. Przy dodawaniu pól do response - aktualizuj schemat Zod w narzędziu
