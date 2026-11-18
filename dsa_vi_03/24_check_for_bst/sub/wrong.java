

// User function Template for Java

class Solution {
    // Function to check whether a Binary Tree is BST or not.
    boolean isBST(Node root) {
        // code here.
        if(root == null) return true;
        
        boolean left = true;
        boolean right = true;
        
        if(root.left != null){
            if(root.left.data < root.data){
                left = isBST(root.left);
            }else left = false;
        }
        if(root.right != null){
            if(root.right.data > root.data){
                right = isBST(root.right);
            }else right = false;
        }
        
        return left && right;
        
    }
}