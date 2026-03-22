import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { resolveAspectRatio } from './platform.constants';

@Injectable()
export class EditImageTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'editImageTool';

  run() {
    return createTool({
      id: 'editImageTool',
      description: `Edit an existing image using AI with text instructions. Uses Gemini image generation.
                    Great for: changing backgrounds, adding seasonal elements, adapting product photos for different campaigns,
                    removing/adding objects, style transfer, adding text overlays, adjusting for different platforms.
                    The source image can be from the media library (sourceImageId) or a URL (sourceImageUrl).
                    The edited image is saved as a NEW entry in the media library — the original is preserved.
                    Can be used for any purpose — posts, knowledge base, reference material.
      `,
      inputSchema: z.object({
        instruction: z
          .string()
          .describe('What to change in the image. E.g., "Change background to beach sunset", "Add Christmas decorations", "Add text SALE -30% in bold red", "Make it look more professional", "Adapt for Instagram square format"'),
        sourceImageId: z
          .string()
          .optional()
          .describe('Media library ID of the source image (from generateImageTool output, postGet, or media library)'),
        sourceImageUrl: z
          .string()
          .optional()
          .describe('URL of the source image (if not using media library)'),
        platform: z
          .string()
          .optional()
          .describe('Target platform for auto aspect ratio'),
        aspectRatio: z
          .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
          .optional()
          .describe('Override aspect ratio for the edited image'),
        model: z
          .enum([
            'gemini-2.5-flash-image',
            'gemini-3.1-flash-image-preview',
            'gemini-3-pro-image-preview',
          ])
          .optional()
          .describe('Gemini model. Default: Nano Banana Pro.'),
        thinkingLevel: z
          .enum(['Minimal', 'High'])
          .optional()
          .describe('Thinking depth for Gemini 3.x models. If not set, uses API default.'),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
      }),
      execute: async (args, options) => {
        const { context, runtimeContext } = args;
        checkAuth(args, options);
        // @ts-ignore
        const org = JSON.parse(runtimeContext.get('organization') as string);

        // Resolve source image URL
        let sourceUrl: string;
        if (context.sourceImageId) {
          const media = await this._mediaService.getMediaById(context.sourceImageId);
          if (!media) {
            throw new Error(`Media not found: ${context.sourceImageId}`);
          }
          sourceUrl = media.path;
        } else if (context.sourceImageUrl) {
          sourceUrl = context.sourceImageUrl;
        } else {
          throw new Error('Either sourceImageId or sourceImageUrl must be provided');
        }

        const aspectRatio = resolveAspectRatio(context.aspectRatio, context.platform);

        const image = await this._mediaService.editImage(
          context.instruction,
          sourceUrl,
          org,
          {
            aspectRatio,
            model: context.model,
            thinkingLevel: context.thinkingLevel,
          }
        );

        if (!image) {
          throw new Error('Image editing returned no data');
        }

        const file = await this.storage.uploadSimple(
          'data:image/png;base64,' + image
        );

        const saved = await this._mediaService.saveFile(org.id, file.split('/').pop() || `edited-${Date.now()}.png`, file);
        return { id: saved.id, path: saved.path };
      },
    });
  }
}
