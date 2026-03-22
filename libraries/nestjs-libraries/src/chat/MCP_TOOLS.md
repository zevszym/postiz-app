# Postiz MCP Server - Dokumentacja narzędzi

## Przegląd

Serwer MCP (Model Context Protocol) pozwala agentom AI (jak Claude) na zarządzanie postami w mediach społecznościowych przez Postiz. Serwer jest dostępny pod endpointem `/mcp/:apiKey`.

## Lista narzędzi

### 1. Zarządzanie integracjami (kanałami)

#### `integrationList`
Lista wszystkich dostępnych integracji/kanałów.

**Wyjście:**
- `id` - ID integracji (używane przy planowaniu postów)
- `name` - nazwa kanału
- `picture` - URL zdjęcia profilowego
- `platform` - identyfikator platformy (facebook, instagram, x, linkedin, etc.)
- `profile` - nazwa użytkownika
- `type` - typ: social lub article
- `disabled` - czy kanał jest wyłączony
- `refreshNeeded` - czy wymaga ponownego połączenia
- `available` - czy można używać do postowania

#### `integrationSchema`
Pobiera reguły i schemat ustawień dla danej platformy.

**Wejście:**
- `isPremium` - czy konto jest premium (dla X/Twitter)
- `platform` - identyfikator platformy

**Wyjście:**
- `rules` - opis reguł platformy
- `maxLength` - maksymalna liczba znaków
- `settings` - schemat JSON ustawień
- `tools` - dostępne narzędzia (np. pobieranie tagów)

#### `integrationTrigger`
Wykonuje dynamiczne akcje dla integracji (np. pobieranie tagów, kategorii).

**Wejście:**
- `integrationId` - ID integracji
- `methodName` - nazwa metody z integrationSchema.tools

---

### 2. Tworzenie postów

#### `schedulePostTool`
Tworzy i planuje nowe posty.

**Wejście:**
- `socialPost` - tablica postów:
  - `integrationId` - ID integracji
  - `isPremium` - czy premium (dla X)
  - `group` - (opcjonalny) identyfikator grupy multi-channel
  - `date` - data publikacji (UTC, ISO format)
  - `shortLink` - czy skrócić linki
  - `type` - draft/schedule/now
  - `postsAndComments` - treść i załączniki:
    - `content` - HTML: `<p>tekst</p>`
    - `attachments` - URLe obrazów
  - `settings` - ustawienia platformy

**Multi-channel posting:**
Aby opublikować ten sam post na kilku platformach jednocześnie (np. Facebook + Instagram), podaj ten sam `group` dla każdego elementu `socialPost`. Posty z tym samym `group` zostaną powiązane w systemie i będą widoczne jako jeden wpis multi-channel.

**Struktura wątków:**
- LinkedIn/Facebook: pierwszy element = post, kolejne = komentarze
- X/Threads/Bluesky: każdy element = osobny post w wątku

---

### 3. Zarządzanie istniejącymi postami

#### `postsList`
Lista zaplanowanych, szkiców i opublikowanych postów.

**Wejście:**
- `startDate` - data początkowa (domyślnie: dziś)
- `endDate` - data końcowa (domyślnie: +30 dni)
- `state` - filtr: all/scheduled/draft/published/error
- `integrationId` - filtr po kanale

**Wyjście:**
- `id` - ID posta
- `group` - ID grupy (wątek/komentarze)
- `content` - treść HTML
- `publishDate` - data publikacji
- `state` - QUEUE/DRAFT/PUBLISHED/ERROR
- `releaseURL` - URL opublikowanego posta
- `integration` - dane kanału

#### `postGet`
Pobiera pełne szczegóły posta wraz z wątkiem/komentarzami.

**Wejście:**
- `postId` - ID posta (z postsList)

**Wyjście:**
- `group` - ID grupy
- `publishDate` - data publikacji
- `state` - stan posta
- `integration` - dane kanału
- `settings` - ustawienia platformy
- `posts` - wszystkie posty w grupie:
  - `id` - ID pojedynczego posta
  - `content` - treść
  - `images` - załączone obrazy

#### `postUpdate`
Zmienia datę publikacji posta.

**Wejście:**
- `postId` - ID posta
- `newDate` - nowa data (ISO format, musi być w przyszłości)

#### `postEdit`
Edytuje treść, obrazy i ustawienia istniejącego posta.

**Wejście:**
- `groupId` - ID grupy (z postGet)
- `integrationId` - ID integracji (z postGet)
- `date` - nowa data (opcjonalnie)
- `postsAndComments` - wszystkie posty w wątku:
  - `id` - ID istniejącego posta (puste dla nowych)
  - `content` - treść HTML
  - `images` - obrazy: `{id, path}`
- `settings` - ustawienia platformy

**Workflow edycji:**
1. `postsList` - znajdź post
2. `postGet` - pobierz szczegóły
3. `postEdit` - zmodyfikuj

#### `postDelete`
Usuwa post (nieodwracalne).

**Wejście:**
- `groupId` - ID grupy (usuwa cały wątek)

---

### 4. Generowanie mediów

#### `generateImageTool`
Generuje obraz AI do dowolnego celu — posty, baza wiedzy, materiały referencyjne, analiza. Obsługuje DALL-E 3 i Gemini (3 modele).

**Wejście:**
- `prompt` - opis obrazu
- `provider` - (opcjonalny) `"dalle"` lub `"gemini"`. Auto-Gemini gdy użyto opcji Gemini.
- `platform` - (opcjonalny) platforma docelowa — auto aspect ratio
- `aspectRatio` - (opcjonalny) nadpisanie aspect ratio
- `model` - (opcjonalny) model Gemini:
  - `gemini-2.5-flash-image` — Nano Banana (szybki/tani)
  - `gemini-3.1-flash-image-preview` — Nano Banana 2 (balanced, Image Search)
  - `gemini-3-pro-image-preview` — Nano Banana Pro (najwyższa jakość)
- `thinkingLevel` - (opcjonalny) `None/Low/Medium/High`. Domyślnie `High`.
- `useGoogleSearch` - (opcjonalny) Google Search grounding — model szuka prawdziwych produktów/trendów
- `useImageSearch` - (opcjonalny) Image Search grounding (auto-switch na Nano Banana 2)
- `referenceImageIds` - (opcjonalny) do 14 ID z media library — spójność wizualna

**Wyjście:**
- `id` - ID obrazu
- `path` - URL obrazu
- `thoughts` - (opcjonalny) proces myślenia modelu
- `textResponse` - (opcjonalny) tekst towarzyszący

#### `editImageTool`
Edycja istniejących obrazów instrukcją tekstową. Oryginał zachowany, edycja jako nowy wpis w media library.

**Wejście:**
- `instruction` - co zmienić ("zmień tło na plażę", "dodaj tekst SALE -30%", "przystosuj na Instagram")
- `sourceImageId` - ID obrazu z media library
- `sourceImageUrl` - lub URL obrazu
- `platform` - (opcjonalny) platforma docelowa
- `aspectRatio` - (opcjonalny) aspect ratio
- `model` - (opcjonalny) model Gemini
- `thinkingLevel` - (opcjonalny) domyślnie `Medium`

**Wyjście:**
- `id`, `path`, `thoughts?`, `textResponse?`

#### `geminiSearchImageTool`
Generowanie obrazów prawdziwych produktów/marek z Google Search grounding. Model szuka produktu w Google przed generacją.

**Wejście:**
- `prompt` - z nazwą produktu/marki ("post na Instagram z ekspresem DeLonghi La Specialista")
- `platform` - (opcjonalny) platforma docelowa
- `aspectRatio` - (opcjonalny) aspect ratio
- `useImageSearch` - (opcjonalny) dodatkowy Image Search (auto Nano Banana 2)
- `referenceImageIds` - (opcjonalny) reference images z media library

**Wyjście:**
- `id`, `path`, `thoughts?`, `textResponse?`

**Automatyczne aspect ratio per platforma:**
| Platforma | Aspect ratio |
|-----------|-------------|
| Instagram | 1:1 |
| Facebook | 1:1 |
| X/Twitter | 16:9 |
| LinkedIn | 1:1 |
| Pinterest | 2:3 |
| TikTok | 9:16 |
| YouTube | 16:9 |
| Threads | 1:1 |
| Bluesky | 16:9 |

**Konfiguracja Gemini (env vars):**
- `GEMINI_API_KEY` - klucz API (wymagany)
- `IMAGE_GENERATION_PROVIDER=gemini` - aby używać Gemini globalnie
- `GEMINI_IMAGE_MODEL` - model (domyślnie: `gemini-3-pro-image-preview`)
- `GEMINI_IMAGE_SIZE` - rozdzielczość (domyślnie: `1K`, opcje: `512`, `1K`, `2K`, `4K`)

#### `generateVideoOptions`
Lista dostępnych szablonów wideo.

#### `generateVideoTool`
Generuje wideo z szablonu.

**Wejście:**
- `identifier` - ID szablonu
- `output` - vertical/horizontal
- `customParams` - parametry szablonu

#### `videoFunctionTool`
Pobiera dane dynamiczne dla wideo (głosy, muzyka).

---

## Format treści

Treść postów musi być w formacie HTML:

```html
<p>Pierwszy akapit</p>
<p>Drugi akapit z <strong>pogrubieniem</strong></p>
<ul>
  <li>Element listy</li>
</ul>
```

**Dozwolone tagi:** `p`, `h1`, `h2`, `h3`, `strong`, `u`, `ul`, `li`

**Uwaga:** Nie można łączyć `<u>` i `<strong>` w tym samym elemencie.

---

## Przykłady użycia

### Zaplanowanie posta na LinkedIn z komentarzem

```javascript
schedulePostTool({
  socialPost: [{
    integrationId: "linkedin-123",
    isPremium: false,
    date: "2024-12-25T14:00:00Z",
    type: "schedule",
    postsAndComments: [
      { content: "<p>Główny post</p>", attachments: [] },
      { content: "<p>Komentarz pod postem</p>", attachments: [] }
    ],
    settings: []
  }]
})
```

### Multi-channel: ten sam post na Facebook i Instagram

```javascript
schedulePostTool({
  socialPost: [
    {
      integrationId: "facebook-123",
      isPremium: false,
      group: "my-group-1",
      date: "2024-12-25T14:00:00Z",
      type: "schedule",
      postsAndComments: [
        { content: "<p>Post na obie platformy!</p>", attachments: [] }
      ],
      settings: []
    },
    {
      integrationId: "instagram-456",
      isPremium: false,
      group: "my-group-1",
      date: "2024-12-25T14:00:00Z",
      type: "schedule",
      postsAndComments: [
        { content: "<p>Post na obie platformy!</p>", attachments: [] }
      ],
      settings: []
    }
  ]
})
```

### Edycja istniejącego posta

```javascript
// 1. Znajdź post
postsList({ state: "scheduled" })

// 2. Pobierz szczegóły
postGet({ postId: "abc123" })

// 3. Edytuj
postEdit({
  groupId: "xyz789",
  integrationId: "linkedin-123",
  postsAndComments: [{
    id: "abc123",
    content: "<p>Zmieniona treść</p>",
    images: [{ id: "img1", path: "https://..." }]
  }]
})
```

---

## Architektura

```
libraries/nestjs-libraries/src/chat/
├── start.mcp.ts              # Inicjalizacja serwera MCP
├── load.tools.service.ts     # Ładowanie narzędzi i konfiguracja agenta
├── chat.module.ts            # Moduł NestJS
├── auth.context.ts           # Kontekst autoryzacji
├── async.storage.ts          # AsyncLocalStorage dla kontekstu
└── tools/
    ├── tool.list.ts                    # Lista wszystkich narzędzi
    ├── integration.list.tool.ts        # Lista kanałów
    ├── integration.validation.tool.ts  # Schemat platformy
    ├── integration.trigger.tool.ts     # Akcje dynamiczne
    ├── integration.schedule.post.ts    # Tworzenie postów
    ├── posts.list.tool.ts              # Lista postów
    ├── post.get.tool.ts                # Szczegóły posta
    ├── post.update.tool.ts             # Zmiana daty
    ├── post.edit.tool.ts               # Edycja treści
    ├── post.delete.tool.ts             # Usuwanie
    ├── generate.image.tool.ts          # Generowanie obrazów
    ├── generate.video.tool.ts          # Generowanie wideo
    ├── generate.video.options.tool.ts  # Opcje wideo
    └── video.function.tool.ts          # Funkcje wideo
```

---

## Changelog

### 2026-03-22
- Dodano obsługę multi-channel posting w `schedulePostTool` — nowy opcjonalny parametr `group` pozwala powiązać posty na różne platformy
- Dodano integrację z Gemini Nano Banana Pro w `generateImageTool` — nowy opcjonalny parametr `provider` + env vars `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `IMAGE_GENERATION_PROVIDER`
- Dodano automatyczny aspect ratio per platforma w `generateImageTool` — parametry `platform` i `aspectRatio`, rozdzielczość 1K domyślnie
- **Major upgrade:** Pełna integracja Gemini Image Generation:
  - Thinking mode (`thinkingLevel: "High"` domyślnie) dla najlepszej jakości
  - Google Search grounding — generowanie obrazów prawdziwych produktów/marek
  - Image Search grounding — wizualne referencje z Google Images (Nano Banana 2)
  - Reference images — do 14 obrazów referencyjnych dla spójności wizualnej
  - Wybór modelu: Nano Banana (fast), Nano Banana 2 (balanced), Nano Banana Pro (quality)
  - Nowy SDK `@google/genai` (zastąpił `@google/generative-ai`)
- Nowy tool `editImageTool` — edycja obrazów instrukcją tekstową (zmiana tła, tekst, adaptacja)
- Nowy tool `geminiSearchImageTool` — generowanie obrazów prawdziwych produktów z Google Search
- Toole obrazowe są uniwersalne — do postów, bazy wiedzy, materiałów referencyjnych

### 2024-01-11
- Naprawiono `integrationList` - dodano obsługę błędów i pola `available`, `disabled`, `refreshNeeded`
- Dodano `postsList` - lista zaplanowanych postów
- Dodano `postGet` - szczegóły posta
- Dodano `postUpdate` - zmiana daty publikacji
- Dodano `postEdit` - edycja treści, obrazów, ustawień
- Dodano `postDelete` - usuwanie postów
- Zaktualizowano instrukcje agenta o nowe możliwości
