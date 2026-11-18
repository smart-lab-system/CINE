# Build context = thư mục bài (có pom.xml + src/)
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# maven.test.skip=true: bỏ cả compile test (sample thường thiếu starter-test).
RUN mvn -B -Dmaven.test.skip=true package \
 && JAR=$(ls target/*.jar 2>/dev/null | grep -vE 'original|plain' | head -n1) \
 && test -n "$JAR" \
 && cp "$JAR" /app/app.jar

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build /app/app.jar /app/app.jar
EXPOSE 8080
ENV JAVA_OPTS=""
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar /app/app.jar"]
