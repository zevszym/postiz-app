import { ShortLinking } from '@gitroom/nestjs-libraries/short-linking/short-linking.interface';

const SHORT_IO_API_ENDPOINT = process.env.SHORT_IO_API_ENDPOINT || 'https://api.short.io';
const SHORT_IO_STATISTICS_ENDPOINT = process.env.SHORT_IO_STATISTICS_ENDPOINT || 'https://statistics.short.io';
const SHORT_IO_DOMAIN = process.env.SHORT_IO_DOMAIN || 'short.io';

const getOptions = () => ({
  headers: {
    Authorization: process.env.SHORT_IO_SECRET_KEY || '',
    'Content-Type': 'application/json',
  },
});

export class ShortIo implements ShortLinking {
  shortLinkDomain = SHORT_IO_DOMAIN;

  async linksStatistics(links: string[]) {
    return Promise.all(
      links.map(async (link) => {
        try {
          const url = `${SHORT_IO_API_ENDPOINT}/links/expand?domain=${
            this.shortLinkDomain
          }&path=${link.split('/').pop()}`;

          const response = await fetch(url, getOptions());

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          const linkStatisticsUrl = `${SHORT_IO_STATISTICS_ENDPOINT}/statistics/link/${data.id}?period=last30&tz=UTC`;

          const statResponse = await fetch(linkStatisticsUrl, getOptions());
          const statData = statResponse.ok ? await statResponse.json() : { totalClicks: 0 };

          return {
            short: data.shortURL || link,
            original: data.originalURL || '',
            clicks: statData.totalClicks?.toString() || '0',
          };
        } catch (error) {
          return {
            short: link,
            original: '',
            clicks: '0',
          };
        }
      })
    );
  }

  async convertLinkToShortLink(id: string, link: string) {
    try {
      const response = await fetch(`${SHORT_IO_API_ENDPOINT}/links`, {
        ...getOptions(),
        method: 'POST',
        body: JSON.stringify({
          originalURL: link,
          domain: this.shortLinkDomain,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      if (!data.shortURL) {
        throw new Error(`No shortURL in response: ${JSON.stringify(data)}`);
      }

      return data.shortURL;
    } catch (error) {
      throw new Error(`Failed to create short link with short.io: ${error}`);
    }
  }

  async convertShortLinkToLink(shortLink: string) {
    try {
      const response = await fetch(
        `${SHORT_IO_API_ENDPOINT}/links/expand?domain=${
          this.shortLinkDomain
        }&path=${shortLink.split('/').pop()}`,
        getOptions()
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.originalURL || '';
    } catch (error) {
      throw new Error(`Failed to expand short link: ${error}`);
    }
  }

  async getAllLinksStatistics(
    id: string,
    page = 1
  ): Promise<{ short: string; original: string; clicks: string }[]> {
    try {
      const response = await fetch(
        `${SHORT_IO_API_ENDPOINT}/api/links?domain_id=${id}&limit=100&offset=${(page - 1) * 100}`,
        getOptions()
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const links = data.links || [];

      const mapLinks = await Promise.all(
        links.map(async (link: any) => {
          try {
            const linkStatisticsUrl = `${SHORT_IO_STATISTICS_ENDPOINT}/statistics/link/${link.id}?period=last30&tz=UTC`;

            const statResponse = await fetch(linkStatisticsUrl, getOptions());
            const statData = statResponse.ok ? await statResponse.json() : { totalClicks: 0 };

            return {
              short: link.shortURL || '',
              original: link.originalURL || '',
              clicks: statData.totalClicks?.toString() || '0',
            };
          } catch {
            return {
              short: link.shortURL || '',
              original: link.originalURL || '',
              clicks: '0',
            };
          }
        })
      );

      if (mapLinks.length < 100) {
        return mapLinks;
      }

      return [...mapLinks, ...(await this.getAllLinksStatistics(id, page + 1))];
    } catch (error) {
      return [];
    }
  }
}
