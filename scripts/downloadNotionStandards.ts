/* eslint-disable @typescript-eslint/naming-convention */
import { Client } from "@notionhq/client";
import { flatten, uniq } from "lodash";
import fs from "fs";
import dotenv from "dotenv";
import { QueryDatabaseResponse } from "@notionhq/client/build/src/api-endpoints";

const STANDARDS_MAPPING_FILE_NAME = "standardMapping";
const JOCONDES_MAPPING_FILE_NAME = "jocondesMapping";

dotenv.config();

const keywordPropertyName = "Keywords to match (standard-jit)";
const mappingDirectoryName = process.env.MAPPING_DIR_NAME || "theodo";
const standardsDatabaseId = process.env.STANDARDS_DB_ID || "id"; // to check, go to https://www.notion.so/m33/732673368f494fe6b46ffa3b63a5f9d5
const jocondesDatabaseId = process.env.JOCONDES_DB_ID || "id";

type KeywordFieldType = {
  rich_text: {
    type: "text";
    text: {
      content: string;
      link: {
        url: string;
      } | null;
    };
    plain_text: string;
  }[];
};

const databaseQueryParameters = {
  filter: {
    property: keywordPropertyName,
    title: {
      is_not_empty: true,
    },
  },
} as const;

function getDatabaseMappingInfo(
  queryResults: QueryDatabaseResponse["results"]
) {
  return queryResults
    .map((standard) => ({
      keywordsFieldValue: (
        standard.properties[keywordPropertyName] as any as KeywordFieldType
      ).rich_text,
      url: standard.url,
    }))
    .filter(({ keywordsFieldValue }) => keywordsFieldValue.length !== 0)
    .map(({ keywordsFieldValue, url }) => ({
      keywords: keywordsFieldValue[0].plain_text.split("\n"),
      url,
    }));
}

async function updateMapping(
  databaseId: string,
  resourceMappingFileName: string,
  notionClient: Client
) {
  const resourceDatabase = await notionClient.databases.query({
    ...databaseQueryParameters,
    database_id: databaseId,
  });

  const resourceMappingInfo = getDatabaseMappingInfo(resourceDatabase.results);

  const resourceKeywords = uniq(
    flatten(resourceMappingInfo.map(({ keywords }) => keywords))
  );

  const keywordToResourceMapping = resourceKeywords.reduce<{
    [keyword: string]: string[];
  }>((mapping, keyword) => {
    return Object.assign(mapping, {
      [keyword]: resourceMappingInfo
        .filter(({ keywords }) => keywords.includes(keyword))
        .map(({ url }) => url),
    });
  }, {});

  fs.writeFileSync(
    `./src/${mappingDirectoryName}/${resourceMappingFileName}.json`,
    JSON.stringify(keywordToResourceMapping)
  );
}

(async () => {
  const notion = new Client({
    auth: process.env.NOTION_API_KEY,
  });

  let hasException = false;

  try {
    await updateMapping(
      standardsDatabaseId,
      STANDARDS_MAPPING_FILE_NAME,
      notion
    );
  } catch {
    console.error("Could not update standards mapping DB.\n");
    hasException = true;
  }

  try {
    await updateMapping(jocondesDatabaseId, JOCONDES_MAPPING_FILE_NAME, notion);
  } catch {
    console.error("Could not update jocondes mapping DB.\n");
    hasException = true;
  }

  if (hasException) {
    throw new Error("One or more resources could not be updated.");
  }
})();
