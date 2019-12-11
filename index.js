const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const md5 = require('md5');
const mime = require('mime-types');

require('dotenv').config();

const GRAPHQL_URL = 'https://www.demarches-simplifiees.fr/api/v2/graphql';
const { DS_DEMARCHE_NUMBER, DS_API_TOCKEN } = process.env;

const GET_DEMARCHE = `query($demarcheNumber: Int!) {
  demarche(number: $demarcheNumber) {
    id
    number
    groupeInstructeurs {
      instructeurs {
        id
        email
      }
    }
    dossiers {
      nodes {
        id
        number
      }
    }
  }
}`;

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
  }
}`;

async function graphQLRequest(query, variables) {
  const body = { query, variables };

  const { data, errors } = await fetch(GRAPHQL_URL, {
    method: 'post',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${DS_API_TOCKEN}`
    },
    body: JSON.stringify(body)
  }).then(response => response.json()).catch(error => ({ errors: [error] }));

  if (errors) {
    let error = new Error(errors[0].message);
    error.errors = errors;
    throw error;
  }

  return data;
}

function getFileInfo(filename) {
  const buffer = fs.readFileSync(filename);

  return {
    filename: path.basename(filename),
    byteSize: buffer.byteLength,
    checksum: md5(buffer),
    contentType: mime.lookup(filename)
  };
}

async function uploadFile({ url, headers }, filename) {
  return fetch(url, {
    method: 'put',
    headers: JSON.parse(headers),
    body: fs.readFileSync(filename)
  });
}

async function main() {
  const { demarche } = await graphQLRequest(GET_DEMARCHE, {
    demarcheNumber: parseInt(DS_DEMARCHE_NUMBER)
  });

  const [dossier] = demarche.dossiers.nodes;
  const [groupeInstructeur] = demarche.groupeInstructeurs;
  const [instructeur] = groupeInstructeur.instructeurs;

  console.log('Dossier :', dossier);
  console.log('Instructeur :', instructeur);

  const { dossier: { messages } } = await graphQLRequest(GET_DOSSIER, {
    dossierNumber: dossier.number
  });

  console.log('Messages :', messages);

  const fileInfo = getFileInfo('./carte-nationale-identite.jpg');

  console.log('File Info :', fileInfo);

  const { createDirectUpload: { directUpload } } = await graphQLRequest(CREATE_DIRECT_UPLOAD, {
    dossierId: dossier.id,
    ...fileInfo
  });

  console.log('Direct Upload :', directUpload);

  await uploadFile(directUpload, './carte-nationale-identite.jpg');

  const { dossierEnvoyerMessage: { message } } = await graphQLRequest(ENVOYER_MESSAGE, {
    dossierId: dossier.id,
    instructeurId: instructeur.id,
    body: 'Bonjour !',
    attachment: directUpload.signedBlobId
  });

  console.log('Message :', message);
}

main().catch(error => console.error(error));
