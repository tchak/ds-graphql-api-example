const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');

require('dotenv').config();

const { GRAPHQL_URL, DS_DOSSIER_NUMBER, DS_API_TOCKEN } = process.env;

const FILE = './carte-nationale-identite.jpg';

const GET_DOSSIER = `query($dossierNumber: Int!) {
  dossier(number: $dossierNumber) {
    id
    number
    instructeurs {
      id
      email
    }
    messages {
      email
      body
      attachment {
        filename
        url
        byteSize
        checksum
        contentType
      }
    }
  }
}`;

const CREATE_DIRECT_UPLOAD = `mutation($dossierId: ID!, $filename: String!, $byteSize: Int!, $checksum: String!, $contentType: String!) {
  createDirectUpload(input: {
    dossierId: $dossierId,
    filename: $filename,
    byteSize: $byteSize,
    checksum: $checksum,
    contentType: $contentType
  }) {
    directUpload {
      url
      headers
      signedBlobId
    }
  }
}`;

const ENVOYER_MESSAGE = `mutation($dossierId: ID!, $instructeurId: ID!, $body: String!, $attachment: ID) {
  dossierEnvoyerMessage(input: {
    dossierId: $dossierId,
    instructeurId: $instructeurId,
    body: $body,
    attachment: $attachment
  }) {
    message {
      email
      body
      attachment {
        filename
        url
        byteSize
        checksum
        contentType
      }
    }
    errors {
      message
    }
  }
}`;

function md5(value) {
  return crypto.createHash('md5').update(value).digest('base64');
}

async function graphQLRequest(query, variables) {
  const body = { query, variables };

  const { data, error, errors } = await fetch(GRAPHQL_URL, {
    method: 'post',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${DS_API_TOCKEN}`,
    },
    body: JSON.stringify(body),
  })
    .then(async (response) => response.json())
    .catch((error) => ({ errors: [error] }));

  if (errors) {
    let err = new Error(errors[0].message);
    err.errors = errors;
    throw err;
  } else if (error) {
    let err = new Error(error.message);
    err.errors = [error];
    throw err;
  }

  return data;
}

function getFileInfo(filename) {
  const buffer = fs.readFileSync(filename);

  return {
    filename: path.basename(filename),
    byteSize: buffer.byteLength,
    checksum: md5(buffer),
    contentType: mime.lookup(filename),
  };
}

async function uploadFile({ url, headers }, filename) {
  return fetch(url, {
    method: 'put',
    headers: JSON.parse(headers),
    body: fs.readFileSync(filename),
  });
}

async function main() {
  const { dossier } = await graphQLRequest(GET_DOSSIER, {
    dossierNumber: parseInt(DS_DOSSIER_NUMBER),
  });
  const {
    id: dossierId,
    instructeurs: [{ id: instructeurId }],
  } = dossier;

  console.log('Dossier :', dossierId);
  console.log('Instructeur :', instructeurId);

  const fileInfo = getFileInfo(FILE);

  console.log('File Info :', fileInfo);

  const { createDirectUpload } = await graphQLRequest(CREATE_DIRECT_UPLOAD, {
    dossierId,
    ...fileInfo,
  });
  const { directUpload } = createDirectUpload;

  console.log('Direct Upload :', directUpload);

  await uploadFile(directUpload, FILE);

  const { dossierEnvoyerMessage } = await graphQLRequest(ENVOYER_MESSAGE, {
    dossierId,
    instructeurId: instructeur.id,
    body: 'Bonjour !',
    attachment: directUpload.signedBlobId,
  });

  console.log('Message :', dossierEnvoyerMessage);
}

main().catch((error) => console.error(error));
