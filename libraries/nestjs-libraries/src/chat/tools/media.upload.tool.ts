import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class MediaUploadTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'mediaUploadTool';

  run() {
    return createTool({
      id: 'mediaUploadTool',
      description: `Upload an image from a public URL into the media library.
                    Use this to import existing product photos, brand assets, or any external image
                    so it can be referenced later (e.g., as referenceImageIds in generateImageTool).
                    Returns the media library ID and path of the saved image.
      `,
      inputSchema: z.object({
        url: z
          .string()
          .describe('Public URL of the image to import (must be directly accessible, e.g., https://example.com/photo.png)'),
        name: z
          .string()
          .optional()
          .describe('Optional name for the media library entry. If not provided, derived from URL filename.'),
      }),
      outputSchema: z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (args, options) => {
        try {
          const { context, runtimeContext } = args;
          checkAuth(args, options);
          // @ts-ignore
          const org = JSON.parse(runtimeContext.get('organization') as string);

          // Fetch the image
          const response = await fetch(context.url);
          if (!response.ok) {
            return { error: `Failed to fetch image: ${response.status} ${response.statusText}` };
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get('content-type') || 'image/png';

          // Determine file extension from content type
          const extMap: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/svg+xml': 'svg',
          };
          const ext = extMap[contentType] || 'png';

          // Upload to storage as base64 data URL
          const base64 = buffer.toString('base64');
          const dataUrl = `data:${contentType};base64,${base64}`;
          const file = await this.storage.uploadSimple(dataUrl);

          // Derive filename
          const urlFilename = context.url.split('/').pop()?.split('?')[0] || `upload-${Date.now()}.${ext}`;
          const fileName = context.name
            ? `${context.name}.${ext}`
            : urlFilename;

          // Save to media library
          const saved = await this._mediaService.saveFile(
            org.id,
            file.split('/').pop() || fileName,
            file,
            fileName
          );

          return { id: saved.id, path: saved.path };
        } catch (err: any) {
          return { error: err.message || 'Unknown error during media upload' };
        }
      },
    });
  }
}
