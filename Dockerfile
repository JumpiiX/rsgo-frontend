FROM nginx:alpine

# Copy the frontend files to nginx html directory
COPY index.html /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src/
COPY game.js /usr/share/nginx/html/
COPY models /usr/share/nginx/html/models/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]