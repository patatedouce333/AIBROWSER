#!/bin/bash

# Script de vérification de la configuration GCP pour Cometeor
echo "=== Vérification de la configuration GCP pour Cometeor ==="
echo ""

# Vérifier si gcloud est installé
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI n'est pas installé. Veuillez l'installer depuis https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo "✅ gcloud CLI trouvé"

# Vérifier si l'utilisateur est connecté
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 > /dev/null; then
    echo "❌ Aucun compte GCP actif trouvé. Exécutez: gcloud auth login"
    exit 1
fi

ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1)
echo "✅ Compte GCP actif: $ACCOUNT"

# Vérifier le projet par défaut
PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT" ]; then
    echo "❌ Aucun projet par défaut configuré. Exécutez: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "✅ Projet par défaut: $PROJECT"

# Vérifier si Vertex AI API est activée
echo ""
echo "Vérification de Vertex AI API..."
if gcloud services list --enabled --filter="name:aiplatform.googleapis.com" --format="value(name)" | grep -q "aiplatform.googleapis.com"; then
    echo "✅ Vertex AI API activée"
else
    echo "❌ Vertex AI API non activée. Activez-la avec:"
    echo "   gcloud services enable aiplatform.googleapis.com"
    exit 1
fi

# Vérifier les permissions
echo ""
echo "Vérification des permissions..."
ACCOUNT_EMAIL=$ACCOUNT

# Vérifier le rôle aiplatform.user
if gcloud projects get-iam-policy $PROJECT --flatten="bindings[].members" --format="table(bindings.members)" --filter="bindings.members:$ACCOUNT_EMAIL AND bindings.role:roles/aiplatform.user" | grep -q "$ACCOUNT_EMAIL"; then
    echo "✅ Rôle 'Utilisateur Vertex AI' (roles/aiplatform.user) accordé"
else
    echo "❌ Rôle 'Utilisateur Vertex AI' manquant. Accordez-le avec:"
    echo "   gcloud projects add-iam-policy-binding $PROJECT \\"
    echo "     --member=user:$ACCOUNT_EMAIL \\"
    echo "     --role=roles/aiplatform.user"
    exit 1
fi

# Vérifier ADC
echo ""
echo "Vérification des Application Default Credentials..."
if [ -f ~/.config/gcloud/application_default_credentials.json ]; then
    echo "✅ ADC configuré"
else
    echo "⚠️  ADC non configuré. Pour les tests locaux, exécutez:"
    echo "   gcloud auth application-default login"
    echo "   Note: L'extension Chrome utilisera OAuth2, pas ADC"
fi

echo ""
echo "=== Configuration GCP OK ==="
echo ""
echo "Pour utiliser l'extension Chrome:"
echo "1. Créez des identifiants OAuth2 dans GCP Console"
echo "2. Configurez le consentement OAuth"
echo "3. Entrez les détails dans les options de l'extension"
echo ""
echo "Extension prête pour Vertex AI ! 🚀"