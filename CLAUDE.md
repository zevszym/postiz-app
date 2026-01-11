This project is Postiz, a tool to schedule social media and chat posts to 28+ channels.
You can add posts to the calendar, they will be added into a workflow and posted at the right time.
You can find things like:
- Schedule posts
- Calendar view
- Analytics
- Team management
- Media library

This project is a monorepo with a root only package.json of dependencies.
Made with PNPM.
We have 3 important folders

- apps/backend - this is where the API code is (NESTJS)
- apps/orchestrator - this is temporal, it's for background jobs (NESTJS) it contains all the workflows and activities
- apps/frontend - this is the code of the frontend (Vite ReactJS)
- /libraries contains a lot of services shared between backend and orchestrator and frontend components.

We are using only pnpm, don't use any other dependency manager.
Never install frontend components from npmjs, focus on writing native components.

The project uses tailwind 3, before writing any component look at:
- /apps/frontend/src/app/colors.scss
- /apps/frontend/src/app/global.scss
- /apps/frontend/tailwind.config.js

All the --color-custom* are deprecated, don't use them.

And check other components in the system before to get the right design.

When working on the backend we need to pass the 3 layers:
Controller >> Service >> Repository (no shortcuts)
In some cases we will have
Controller >> Mananger >> Service >> Repository.

Most of the server logic should be inside of libs/server.
The backend repository is mostly used to write controller, and import files from libs.server.

For the frontend follow this:
- Many of the UI components lives in /apps/frontend/src/components/ui
- Routing is in /apps/frontend/src/app
- Components are in /apps/frontend/src/components
- always use SWR to fetch stuff, and use "useFetch" hook from /libraries/helpers/src/utils/custom.fetch.tsx

When using SWR, each one have to be in a seperate hook and must comply with react-hooks/rules-of-hooks, never put eslint-disable-next-line on it.

It means that this is valid:
const useCommunity = () => {
   return useSWR....
}

This is not valid:
const useCommunity = () => {
  return {
    communities: () => useSWR<CommunitiesListResponse>("communities", getCommunities),
    providers: () => useSWR<ProvidersListResponse>("providers", getProviders),
  };
}

- Linting of the project can run only from the root.
- Use only pnpm.

---

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

## Tips dla Claude

1. Przy modyfikacji narzędzi MCP - pamiętaj o aktualizacji `MCP_TOOLS.md`
2. Providery platform są w `integrations/social/` - każdy plik to jedna platforma
3. Serwisy bazy są w `database/prisma/` - `*.service.ts` i `*.repository.ts`
4. Przy dodawaniu pól do response - aktualizuj schemat Zod w narzędziu
