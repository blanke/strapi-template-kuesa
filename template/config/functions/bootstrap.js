"use strict";

const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

const articleItems = require("../../data/article-item.json");
const articles = require("../../data/article.json");
const boards = require("../../data/blog-board.json");
const pages = require("../../data/page.json");
const site = require("../../data/site.json");
const teasers = require("../../data/teaser.json");
const navigations = require("../../data/navigation.json");
const writers = require("../../data/writer.json");

async function isFirstRun() {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: "type",
    name: "setup",
  });
  const initHasRun = await pluginStore.get({ key: "initHasRun" });
  await pluginStore.set({ key: "initHasRun", value: true });
  return !initHasRun;
};

async function setPublicPermissions(newPermissions) {
  // Find the ID of the public role
  const publicRole = await strapi
    .query("role", "users-permissions")
    .findOne({ type: "public" });

  // List all available permissions
  const publicPermissions = await strapi
    .query("permission", "users-permissions")
    .find({
      type: ["users-permissions", "application"],
      role: publicRole.id,
    });

  // Update permission to match new config
  const controllersToUpdate = Object.keys(newPermissions);
  const updatePromises = publicPermissions
    .filter((permission) => {
      // Only update permissions included in newConfig
      if (!controllersToUpdate.includes(permission.controller)) {
        return false;
      }
      if (!newPermissions[permission.controller].includes(permission.action)) {
        return false;
      }
      return true;
    })
    .map((permission) => {
      // Enable the selected permissions
      return strapi
        .query("permission", "users-permissions")
        .update({ id: permission.id }, { enabled: true })
    });
  await Promise.all(updatePromises);
}

function getFileSizeInBytes(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats["size"];
  return fileSizeInBytes;
};

function getFileData(fileName) {
  const filePath = `./data/uploads/${fileName}`;

  // Parse the file metadata
  const size = getFileSizeInBytes(filePath);
  const ext = fileName.split(".").pop();
  const mimeType = mime.lookup(ext);

  return {
    path: filePath,
    name: fileName,
    size,
    type: mimeType,
  }
}

// Create an entry and attach files if there are any
async function createEntry({ model, entry, files }) {
  try {
    const createdEntry = await strapi.query(model).create(entry);
    if (files) {
      await strapi.entityService.uploadFiles(createdEntry, files, {
        model,
      });
    }
  } catch (e) {
    console.log('model', entry, e);
  }
}

async function importEntity(element, entity, assets, image) {
    var files = {}
    if (element[image]) {
      files[image] = assets.get(`${element[image].name}`);
    };
    return createEntry({ model: entity, entry: element, files });
}


async function importEntities(constElements, entity, assets, image) {
  return Promise.all(constElements.map((element) => {
    console.log("one element " + image);
    var files = {}
    if (element[image]) {
      files[image] = assets.get(`${element[image].name}`);
    };
    return createEntry({ model: entity, entry: element, files });
  }));
}

async function importSeedData(assets) {
  await setPublicPermissions({
    writer: ['find', 'findone'],
    articleItem: ['find', 'findone'],
    teaser: ['find', 'findone'],
    article: ['find', 'findone'],
    blogBoard: ['find', 'findone'],
    navigation: ['find', 'findone'],
    page: ['find', 'findone'],
    site: ['find']
  });

  // Create all entries
  await importEntities(writers, "writer", assets, "image");
  await importEntities(articleItems, "article-item", assets, "image");
  await importEntities(articles, "article", assets, "image");
  await importEntities(teasers, "teaser", assets, "image");
  await importEntities(boards, "blog-board", assets, "image");
  await importEntities(navigations, "navigation", assets, "image");
  await importEntities(pages, "page", assets, "image");
  await importEntity(site, "site", assets, "image");

}

async function importAssets() {

  var map = new Map();
  const files = fs.readdirSync("./data/uploads/");
  files.forEach(function (file, index) {
      if (!file.startsWith(".")) {
        map.set(file, getFileData(file));
      }
  });
  return map;
}

module.exports = async () => {

  const shouldImportSeedData = await isFirstRun();

  const assets = await importAssets();
  await importSeedData(assets);

  if (shouldImportSeedData) {
    try {
      await importAssets();
      await importSeedData();
    } catch (error) {
      console.log('Could not import seed data');
      console.error(error);
    }
  }
};
