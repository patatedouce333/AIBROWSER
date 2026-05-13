# Configuration OAuth2 pour Cometeor Extension

## Étapes détaillées pour configurer OAuth2 dans GCP

### 1. Accéder à GCP Console
- Allez sur https://console.cloud.google.com/
- Sélectionnez votre projet (project-5f9c90a7-b952-41df-a41)

### 2. Activer Vertex AI API
```
Navigation: APIs & Services → Bibliothèque
Rechercher: "Vertex AI API"
Cliquer: Activer
```

### 3. Créer les identifiants OAuth2

#### a) Accéder à la section Credentials
```
Navigation: APIs & Services → Identifiants
```

#### b) Créer un nouvel ID client OAuth
```
Cliquer: + CRÉER DES IDENTIFIANTS
Sélectionner: ID client OAuth
```

#### c) Configurer l'application Web
```
Type d'application: Application Web
Nom: "Cometeor Extension OAuth"
```

#### d) URI de redirection autorisées
```
AJOUTER UN URI: https://[VOTRE_EXTENSION_ID].chromiumapp.org/
```
⚠️ **Important**: Remplacez `[VOTRE_EXTENSION_ID]` par l'ID réel de votre extension.
- Après avoir chargé l'extension en mode développeur, allez dans `chrome://extensions/`
- Copiez l'ID de l'extension (32 caractères)
- Exemple: `https://abcdefghijklmnop.chromiumapp.org/`

### 4. Configurer l'écran de consentement OAuth

#### a) Accéder à l'écran de consentement
```
Navigation: APIs & Services → Écran de consentement OAuth
```

#### b) Type d'utilisateur
- **Internal**: Si vous utilisez un Workspace Google (recommandé)
- **External**: Pour les utilisateurs externes

#### c) Informations de l'application
```
Nom de l'application: Cometeor AI Assistant
E-mail d'assistance: votre.email@domain.com
Logo: (optionnel)
Domaine: (optionnel)
```

#### d) Portées autorisées
```
Cliquer: AJOUTER OU SUPPRIMER DES PORTÉES
Manuellement ajouter: https://www.googleapis.com/auth/cloud-platform
```

#### e) Utilisateurs de test (si External)
```
Ajouter votre adresse e-mail: votre.email@gmail.com
```

### 5. Vérifier les permissions IAM

#### a) Accéder à IAM
```
Navigation: IAM & Administration → IAM
```

#### b) Vérifier/ajouter le rôle
```
Rechercher votre compte: votre.email@gmail.com
Vérifier qu'il a: Utilisateur Vertex AI (roles/aiplatform.user)
```

Si le rôle manque:
```
Cliquer: AJOUTER
Nouvelle entité: votre.email@gmail.com
Rôles: Utilisateur Vertex AI
Cliquer: ENREGISTRER
```

### 6. Configurer l'extension

#### a) Ouvrir les options de l'extension
```
Clic droit sur l'icône Cometeor → Options
```

#### b) Entrer les paramètres
```
Project ID: project-5f9c90a7-b952-41df-a41
Region: us-central1
Model: gemini-2.0-flash-exp
Client ID: [L'ID client OAuth créé à l'étape 3]
```

### 7. Tester la connexion

#### a) Ouvrir la sidebar
```
Cliquer sur l'icône Cometeor dans la barre d'outils
```

#### b) Vérifier l'authentification
- Le statut devrait afficher "✓ Authenticated"
- Si "✗ Not authenticated", cliquer pour s'authentifier

#### c) Tester une tâche simple
```
Entrer: "Dis bonjour"
Cliquer: Send
```

## Dépannage

### Erreur: "invalid_client"
- Vérifiez que l'URI de redirection correspond exactement à l'ID de l'extension

### Erreur: "access_denied"
- Vérifiez que votre e-mail est dans les utilisateurs de test (si External)
- Vérifiez que l'écran de consentement est publié

### Erreur: "insufficient_scope"
- Vérifiez que la portée `cloud-platform` est ajoutée dans l'écran de consentement

### Erreur: "Permission Denied" dans Vertex AI
- Vérifiez que vous avez le rôle `roles/aiplatform.user`
- Attendez 5-10 minutes après avoir ajouté le rôle

## URLs importantes

- GCP Console: https://console.cloud.google.com/
- Vertex AI: https://console.cloud.google.com/vertex-ai
- Extensions Chrome: chrome://extensions/
- Documentation OAuth2: https://developers.google.com/identity/protocols/oauth2

## Support

Si vous rencontrez des problèmes:
1. Vérifiez les logs de la console Chrome (F12 → Console)
2. Vérifiez les permissions GCP
3. Redémarrez Chrome complètement
4. Rechargez l'extension