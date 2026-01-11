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
  - `date` - data publikacji (UTC, ISO format)
  - `shortLink` - czy skrócić linki
  - `type` - draft/schedule/now
  - `postsAndComments` - treść i załączniki:
    - `content` - HTML: `<p>tekst</p>`
    - `attachments` - URLe obrazów
  - `settings` - ustawienia platformy

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
Generuje obraz AI na podstawie promptu.

**Wejście:**
- `prompt` - opis obrazu

**Wyjście:**
- `id` - ID obrazu
- `path` - URL obrazu

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

### 2024-01-11
- Naprawiono `integrationList` - dodano obsługę błędów i pola `available`, `disabled`, `refreshNeeded`
- Dodano `postsList` - lista zaplanowanych postów
- Dodano `postGet` - szczegóły posta
- Dodano `postUpdate` - zmiana daty publikacji
- Dodano `postEdit` - edycja treści, obrazów, ustawień
- Dodano `postDelete` - usuwanie postów
- Zaktualizowano instrukcje agenta o nowe możliwości
