import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { resolveAspectRatio } from './platform.constants';

@Injectable()
export class GeminiSearchImageTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'geminiSearchImageTool';

  run() {
    return createTool({
      id: 'geminiSearchImageTool',
      description: `Generate a social media image based on REAL products, brands, and current trends using Google Search grounding.
                    The AI will first search Google for the real product/brand information and visuals, then generate an image.
                    Perfect for e-commerce: "create an Instagram post for the DeLonghi La Specialista espresso machine"
                    — the model will look up the real product first.
                    Also supports Image Search grounding for even better visual accuracy.
                    The image is saved to the media library — use it for posts, knowledge base, or reference.
      `,
      inputSchema: z.object({
        prompt: z
          .string()
          .describe('What to generate. Include product names, brands, specific models. E.g., "Professional Instagram post featuring the Nike Air Max 90 in white colorway on a clean studio background"'),
        platform: z
          .string()
          .optional()
          .describe('Target platform for auto aspect ratio'),
        aspectRatio: z
          .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
          .optional()
          .describe('Override aspect ratio'),
        useImageSearch: z
          .boolean()
          .optional()
          .describe('Also use Google Image Search for visual context. Automatically uses Nano Banana 2 model. Default: false.'),
        referenceImageIds: z
          .array(z.string())
          .max(14)
          .optional()
          .describe('Additional reference images from media library for style/product consistency'),
      }),
      outputSchema: z.object({
        id: z.string(),
        path: z.string(),
        thoughts: z.string().optional(),
        textResponse: z.string().optional(),
      }),
      execute: async (args, options) => {
        const { context, runtimeContext } = args;
        checkAuth(args, options);
        // @ts-ignore
        const org = JSON.parse(runtimeContext.get('organization') as string);

        const aspectRatio = resolveAspectRatio(context.aspectRatio, context.platform);

        // Use Image Search model when requested, otherwise Pro for best quality
        const model = context.useImageSearch
          ? 'gemini-3.1-flash-image-preview'
          : 'gemini-3-pro-image-preview';

        // Resolve reference image URLs
        let referenceImageUrls: string[] | undefined;
        if (context.referenceImageIds?.length) {
          const mediaRecords = await Promise.all(
            context.referenceImageIds.map((id: string) =>
              this._mediaService.getMediaById(id)
            )
          );
          referenceImageUrls = mediaRecords
            .filter(Boolean)
            .map((m: any) => m.path);
        }

        const image = await this._mediaService.generateImage(
          context.prompt,
          org,
          false,
          'gemini',
          aspectRatio,
          {
            model,
            thinkingLevel: 'High',
            useGoogleSearch: true,
            useImageSearch: context.useImageSearch || false,
            referenceImageUrls,
          }
        );

        if (!image) {
          throw new Error('Image generation returned no data');
        }

        const file = await this.storage.uploadSimple(
          'data:image/png;base64,' + image
        );

        const saved = await this._mediaService.saveFile(org.id, file.split('/').pop(), file);
        return { id: saved.id, path: saved.path };
      },
    });
  }
}
