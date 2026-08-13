# Base image with JDK
FROM eclipse-temurin:21

# Set Android SDK root
ENV ANDROID_SDK_ROOT=/sdk
ENV PATH=$ANDROID_SDK_ROOT/cmdline-tools/tools/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH

# Install system dependencies, Node.js, and Android SDK
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p $ANDROID_SDK_ROOT/cmdline-tools \
    && wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmd.zip \
    && unzip /tmp/cmd.zip -d $ANDROID_SDK_ROOT/cmdline-tools \
    && mv $ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools $ANDROID_SDK_ROOT/cmdline-tools/tools \
    && rm /tmp/cmd.zip \
    && yes | sdkmanager --sdk_root=$ANDROID_SDK_ROOT "platform-tools" "platforms;android-35" "build-tools;35.0.0" \
    && yes | sdkmanager --licenses --sdk_root=$ANDROID_SDK_ROOT
