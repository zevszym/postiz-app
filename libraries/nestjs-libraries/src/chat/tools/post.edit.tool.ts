// CRAFTBE: przeniesione z gałęzi craftbe-artemis (Mastra 0.20) na API Mastra 1.x.
// Zapis idzie tą samą drogą co edytor w panelu (mapTypeToPost + createPost),
// z tą samą walidacją co schedulePostTool (validatePosts).
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  ValidUrlExtension,
  ValidUrlPath,
} from '@gitroom/helpers/utils/valid.url.path';
import dayjs from 'dayjs';

const validUrlExtension = new ValidUrlExtension();
const validUrlPath = new ValidUrlPath();

const attachmentUrl = z
  .string()
  .refine((url) => validUrlPath.validate(url, {} as any), {
    message: validUrlPath.defaultMessage({} as any),
  })
  .refine((url) => validUrlExtension.validate(url, {} as any), {
    message: validUrlExtension.defaultMessage({} as any),
  });

const attachment = z.union([
  attachmentUrl,
  z.object({ path: attachmentUrl, alt: z.string().optional() }),
]);

@Injectable()
export class PostEditTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postEditTool';

  run() {
    return createTool({
      id: 'postEditTool',
      mcp: {
        annotations: {
          title: 'Edit Post',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
Edit an existing post that was NOT published yet (scheduled or draft): its text, the items of the thread / the comments, the media, the publish date and the provider settings.
Always call postGetTool first and start from what it returns.
- postsAndComments replaces the whole thread: pass every item you want to keep, in order. Keep the "id" of existing items; items without "id" are added; existing items you leave out are removed.
- attachments: omit to keep the item's current media, pass [] to remove them, or pass the new list (URLs from mediaListTool / uploadFromUrlTool).
- date: omit to keep the current publish date (it must still be in the future for a scheduled post).
- settings: only the keys you pass change (get them with the integrationSchema tool [input:settings]).
A published post cannot be edited - Postiz cannot change it on the social network.
Show the user the post before and after the change and get their confirmation first.
If validation fails, the result contains output.errors describing what to fix.
`,
      inputSchema: z.object({
        id: z.string().describe('The "id" of the post (from postGetTool)'),
        date: z
          .string()
          .optional()
          .describe('New publish date in UTC (ISO 8601); omit to keep it'),
        postsAndComments: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe('Existing item id from postGetTool; omit for a new item'),
              content: z
                .string()
                .describe(
                  'HTML, each line wrapped in <p>; allowed tags: h1, h2, h3, u, strong, li, ul, p'
                ),
              attachments: z.array(attachment).optional(),
            })
          )
          .min(1)
          .describe('The whole thread: first item is the main post, the rest are thread items or comments'),
        settings: z
          .array(z.object({ key: z.string(), value: z.any() }))
          .optional(),
      }),
      outputSchema: z.object({
        output: z
          .object({
            postId: z.string(),
            publishDate: z.string(),
            previewUrl: z.string(),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        try {
          const current: any = await this._postsService.getPost(
            organizationId,
            inputData.id
          );
          const first = current.posts[0];

          if (first.state !== 'QUEUE' && first.state !== 'DRAFT') {
            return {
              output: {
                errors:
                  first.state === 'PUBLISHED'
                    ? 'This post is already published - Postiz cannot change it on the social network. Delete it there by hand or create a new post.'
                    : 'This post failed to publish (ERROR) - create a new post instead of editing it.',
              },
            };
          }

          const date = inputData.date
            ? dayjs(inputData.date)
            : dayjs(first.publishDate);
          if (!date.isValid()) {
            return { output: { errors: 'Invalid date, use ISO 8601 in UTC' } };
          }
          if (first.state === 'QUEUE' && date.isBefore(dayjs())) {
            return {
              output: {
                errors: 'The publish date is in the past - pass a new future date',
              },
            };
          }

          const imagesById = new Map<string, any[]>(
            current.posts.map((p: any) => [p.id, p.image || []])
          );
          const value = inputData.postsAndComments.map((p: any) => ({
            id: p.id || makeId(10),
            content: p.content,
            delay: 0,
            image:
              p.attachments === undefined
                ? imagesById.get(p.id) || []
                : p.attachments.map((a: any) =>
                    typeof a === 'string'
                      ? { id: makeId(10), path: a }
                      : { id: makeId(10), path: a.path, alt: a.alt }
                  ),
          }));

          const settings = {
            ...(current.settings || {}),
            ...(inputData.settings || []).reduce(
              (acc: Record<string, any>, s: { key: string; value: any }) => ({
                ...acc,
                [s.key]: s.value,
              }),
              {}
            ),
          };

          const [validation] = await this._postsService.validatePosts(
            organizationId,
            [{ integration: { id: current.integration }, settings, value }]
          );
          if (validation.emptyContent) {
            return {
              output: {
                errors: 'The post should have at least one character or one image.',
              },
            };
          }
          if (first.state === 'QUEUE') {
            if (!validation.valid) {
              return {
                output: { errors: validation.settingsError || 'Please fix the settings' },
              };
            }
            if (validation.errors !== true) {
              return { output: { errors: String(validation.errors) } };
            }
            if (validation.tooLong) {
              return {
                output: {
                  errors: `The maximum characters is ${validation.maximumCharacters}`,
                },
              };
            }
          }

          const body = await this._postsService.mapTypeToPost(
            {
              type: first.state === 'DRAFT' ? 'draft' : 'schedule',
              date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
              shortLink: false,
              tags: [],
              posts: [
                {
                  integration: { id: current.integration },
                  group: current.group,
                  settings,
                  value,
                },
              ],
            } as any,
            organizationId
          );
          const [saved] = await this._postsService.createPost(
            organizationId,
            body,
            'MCP'
          );

          return {
            output: {
              postId: saved.postId,
              publishDate: date.toISOString(),
              previewUrl: `${process.env.FRONTEND_URL}/p/${saved.postId}?share=true`,
            },
          };
        } catch (err: any) {
          return { output: { errors: err?.message || 'Failed to edit the post' } };
        }
      },
    });
  }
}
