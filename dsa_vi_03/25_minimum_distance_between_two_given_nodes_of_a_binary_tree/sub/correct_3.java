

// FUNCTION CODE
/* A Binary Tree node
class Node
{
    int data;
    Node left, right;
   Node(int item)    {
        data = item;
        left = right = null;
    }
} */

/* Should return minimum distance between a and b
   in a tree with given root*/
class GfG {
    Node LCA(Node root, int a, int b){
        if(root == null || root.data == a || root.data == b){
            return root;
        }
        
        Node leftChild = LCA(root.left, a, b); 
        Node rightChild = LCA(root.right, a, b);
        
        if(leftChild == null) {
            return rightChild;
        }
        else if(rightChild == null){
            return leftChild;
        }
        return root;
    }
    int lcaDist(Node root, int n){
        if(root == null ){
            return -1;
        }
        if(root.data == n){
            return 0;
        }
        
        int leftDist =lcaDist(root.left, n);
        int rightDist= lcaDist(root.right,n);
        
        if(leftDist == -1 && rightDist == -1){
            return -1;
        }
        else if(leftDist == -1){
            return rightDist + 1;
        }
        else{
            return leftDist + 1;
        }
    }
    int findDist(Node root, int a, int b) {
       Node lca = LCA(root, a, b);
       int dist1 = lcaDist(lca, a);
       int dist2 = lcaDist(lca, b);
       
       return dist1+dist2;
    }
}